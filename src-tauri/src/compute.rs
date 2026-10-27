use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::State;
use tokio::sync::OnceCell;

const MAX_ELEMENTS: u32 = 1_000_000;
const WORKGROUP_SIZE: u32 = 64;

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComputeBackend {
    Auto,
    Cpu,
    Gpu,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuStatus {
    pub available: bool,
    pub adapter_name: Option<String>,
    pub backend: Option<String>,
    pub device_type: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeResult {
    pub requested_backend: String,
    pub execution_backend: String,
    pub adapter_name: Option<String>,
    pub elements: u32,
    pub elapsed_milliseconds: f64,
    pub checksum: u64,
    pub preview: Vec<u32>,
    pub fallback_reason: Option<String>,
}

struct GpuContext {
    adapter_info: wgpu::AdapterInfo,
    device: wgpu::Device,
    queue: wgpu::Queue,
}

#[derive(Default)]
pub struct ComputeRuntime {
    gpu: OnceCell<Result<Arc<GpuContext>, String>>,
}

impl ComputeRuntime {
    async fn gpu_context(&self) -> Result<Arc<GpuContext>, String> {
        self.gpu
            .get_or_init(|| async {
                let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
                let adapter = instance
                    .request_adapter(&wgpu::RequestAdapterOptions {
                        power_preference: wgpu::PowerPreference::HighPerformance,
                        force_fallback_adapter: false,
                        compatible_surface: None,
                    })
                    .await
                    .ok_or_else(|| "No compatible compute adapter was found.".to_string())?;
                let adapter_info = adapter.get_info();
                let (device, queue) = adapter
                    .request_device(
                        &wgpu::DeviceDescriptor {
                            label: Some("Chain-V compute device"),
                            ..Default::default()
                        },
                        None,
                    )
                    .await
                    .map_err(|error| format!("Could not initialize the compute device: {error}"))?;
                Ok(Arc::new(GpuContext {
                    adapter_info,
                    device,
                    queue,
                }))
            })
            .await
            .clone()
    }

    pub async fn gpu_status(&self) -> GpuStatus {
        match self.gpu_context().await {
            Ok(context) => GpuStatus {
                available: true,
                adapter_name: Some(context.adapter_info.name.clone()),
                backend: Some(format!("{:?}", context.adapter_info.backend)),
                device_type: Some(format!("{:?}", context.adapter_info.device_type)),
                error: None,
            },
            Err(error) => GpuStatus {
                available: false,
                adapter_name: None,
                backend: None,
                device_type: None,
                error: Some(error),
            },
        }
    }

    pub async fn run_probe(
        &self,
        elements: u32,
        requested_backend: ComputeBackend,
    ) -> Result<ComputeResult, String> {
        if !(1..=MAX_ELEMENTS).contains(&elements) {
            return Err(format!(
                "Element count must be between 1 and {MAX_ELEMENTS}."
            ));
        }

        let input_a: Vec<u32> = (0..elements).map(|index| index % 97).collect();
        let input_b: Vec<u32> = (0..elements).map(|index| index % 53).collect();
        let requested_name = match requested_backend {
            ComputeBackend::Auto => "auto",
            ComputeBackend::Cpu => "cpu",
            ComputeBackend::Gpu => "gpu",
        };

        let mut fallback_reason = None;
        if matches!(
            requested_backend,
            ComputeBackend::Gpu | ComputeBackend::Auto
        ) {
            match self.gpu_context().await {
                Ok(context) => match run_gpu_probe(&context, &input_a, &input_b).await {
                    Ok((output, elapsed)) => {
                        return Ok(build_result(
                            requested_name,
                            "gpu",
                            Some(context.adapter_info.name.clone()),
                            output,
                            elapsed,
                            None,
                        ));
                    }
                    Err(error) if matches!(requested_backend, ComputeBackend::Gpu) => {
                        return Err(error);
                    }
                    Err(error) => fallback_reason = Some(error),
                },
                Err(error) if matches!(requested_backend, ComputeBackend::Gpu) => {
                    return Err(error);
                }
                Err(error) => fallback_reason = Some(error),
            }
        }

        let started = Instant::now();
        let output = cpu_probe(&input_a, &input_b);
        Ok(build_result(
            requested_name,
            "cpu",
            None,
            output,
            started.elapsed(),
            fallback_reason,
        ))
    }
}

#[tauri::command]
pub async fn get_gpu_status(runtime: State<'_, ComputeRuntime>) -> Result<GpuStatus, String> {
    Ok(runtime.gpu_status().await)
}

#[tauri::command]
pub async fn run_compute_probe(
    runtime: State<'_, ComputeRuntime>,
    elements: u32,
    backend: ComputeBackend,
) -> Result<ComputeResult, String> {
    runtime.run_probe(elements, backend).await
}

fn cpu_probe(input_a: &[u32], input_b: &[u32]) -> Vec<u32> {
    input_a
        .iter()
        .zip(input_b)
        .map(|(a, b)| a * 3 + b)
        .collect()
}

fn build_result(
    requested_backend: &str,
    execution_backend: &str,
    adapter_name: Option<String>,
    output: Vec<u32>,
    elapsed: Duration,
    fallback_reason: Option<String>,
) -> ComputeResult {
    ComputeResult {
        requested_backend: requested_backend.to_string(),
        execution_backend: execution_backend.to_string(),
        adapter_name,
        elements: output.len() as u32,
        elapsed_milliseconds: elapsed.as_secs_f64() * 1000.0,
        checksum: output.iter().map(|value| u64::from(*value)).sum(),
        preview: output.iter().take(8).copied().collect(),
        fallback_reason,
    }
}

async fn run_gpu_probe(
    context: &GpuContext,
    input_a: &[u32],
    input_b: &[u32],
) -> Result<(Vec<u32>, Duration), String> {
    let started = Instant::now();
    let device = &context.device;
    let byte_size = std::mem::size_of_val(input_a) as u64;
    let output_size = byte_size;
    let limits = device.limits();
    if byte_size > u64::from(limits.max_storage_buffer_binding_size)
        || output_size > limits.max_buffer_size
    {
        return Err("The requested workload exceeds this adapter's buffer limits.".to_string());
    }

    let input_a_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("compute probe input A"),
        size: byte_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let input_b_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("compute probe input B"),
        size: byte_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("compute probe output"),
        size: output_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });
    let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("compute probe readback"),
        size: output_size,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let input_a_bytes: Vec<u8> = input_a
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let input_b_bytes: Vec<u8> = input_b
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    context
        .queue
        .write_buffer(&input_a_buffer, 0, &input_a_bytes);
    context
        .queue
        .write_buffer(&input_b_buffer, 0, &input_b_bytes);

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("generic compute probe"),
        source: wgpu::ShaderSource::Wgsl(
            r#"
                @group(0) @binding(0) var<storage, read> input_a: array<u32>;
                @group(0) @binding(1) var<storage, read> input_b: array<u32>;
                @group(0) @binding(2) var<storage, read_write> output: array<u32>;

                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                    let index = id.x;
                    if (index < arrayLength(&output)) {
                        output[index] = input_a[index] * 3u + input_b[index];
                    }
                }
            "#
            .into(),
        ),
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("compute probe bind group layout"),
        entries: &[
            storage_entry(0, true),
            storage_entry(1, true),
            storage_entry(2, false),
        ],
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("compute probe pipeline layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("compute probe pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: Some("main"),
        compilation_options: Default::default(),
        cache: None,
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("compute probe bind group"),
        layout: &bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: input_a_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: input_b_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: output_buffer.as_entire_binding(),
            },
        ],
    });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("compute probe encoder"),
    });
    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("compute probe pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.dispatch_workgroups(input_a.len().div_ceil(WORKGROUP_SIZE as usize) as u32, 1, 1);
    }
    encoder.copy_buffer_to_buffer(&output_buffer, 0, &readback_buffer, 0, output_size);
    context.queue.submit([encoder.finish()]);

    let slice = readback_buffer.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result.map_err(|error| error.to_string()));
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|error| format!("Could not read compute results: {error}"))?
        .map_err(|error| format!("Could not map compute results: {error}"))?;
    let mapped = slice.get_mapped_range();
    let (chunks, remainder) = mapped.as_chunks::<4>();
    if !remainder.is_empty() {
        return Err("The compute device returned an incomplete result buffer.".to_string());
    }
    let output = chunks
        .iter()
        .map(|chunk| u32::from_le_bytes(*chunk))
        .collect();
    drop(mapped);
    readback_buffer.unmap();
    Ok((output, started.elapsed()))
}

fn storage_entry(binding: u32, read_only: bool) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_probe_runs_a_generic_elementwise_operation() {
        assert_eq!(cpu_probe(&[0, 1, 2, 96], &[0, 2, 52, 0]), [0, 5, 58, 288]);
    }

    #[test]
    fn cpu_probe_output_includes_preview_and_checksum() {
        let result = build_result(
            "cpu",
            "cpu",
            None,
            cpu_probe(&[0, 1, 2], &[0, 2, 4]),
            Duration::from_millis(3),
            None,
        );
        assert_eq!(result.checksum, 15);
        assert_eq!(result.preview, [0, 5, 10]);
        assert_eq!(result.elements, 3);
    }

    #[test]
    fn automatic_probe_uses_gpu_or_reports_its_cpu_fallback() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("test runtime should initialize");
        let result = runtime
            .block_on(ComputeRuntime::default().run_probe(32, ComputeBackend::Auto))
            .expect("automatic mode should produce a result");
        let expected = cpu_probe(
            &(0..32).map(|index| index % 97).collect::<Vec<_>>(),
            &(0..32).map(|index| index % 53).collect::<Vec<_>>(),
        );
        assert_eq!(
            result.checksum,
            expected.iter().map(|value| u64::from(*value)).sum::<u64>()
        );
        match result.execution_backend.as_str() {
            "gpu" => {
                assert!(result.adapter_name.is_some());
                assert!(result.fallback_reason.is_none());
            }
            "cpu" => assert!(result.fallback_reason.is_some()),
            backend => panic!("unexpected execution backend: {backend}"),
        }
    }

    #[test]
    fn gpu_probe_computes_values_when_a_device_is_available() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("test runtime should initialize");
        let compute = ComputeRuntime::default();
        let status = runtime.block_on(compute.gpu_status());
        if status.available {
            let result = runtime
                .block_on(compute.run_probe(32, ComputeBackend::Gpu))
                .expect("an available GPU should complete the generic probe");
            assert_eq!(result.execution_backend, "gpu");
            assert!(result.adapter_name.is_some());
            assert_eq!(result.preview.len(), 8);
            assert!(result.fallback_reason.is_none());
        }
    }
}
