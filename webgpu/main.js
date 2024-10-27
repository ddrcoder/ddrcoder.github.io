const canvas = document.querySelector('canvas');

// Initialize WebGPU
if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
}

// Initialize WebGPU
if (!navigator.gpu) { throw new Error('WebGPU not supported'); }
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: 'premultiplied', });

// At the top of your script
const shaderCode = await fetch('shader.wgsl').then(r => r.text());

// Create shader
const shaderModule = device.createShaderModule({ label: "Fractal shader", code: shaderCode, });

// Create pipeline
const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
    },
    fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{
            format,
        }],
    },
});

// Create uniform buffer
const uniformBuffer = device.createBuffer({
    label: "Uniform Buffer",
    size: 64,  // 10 floats (40 bytes) aligned to 16 bytes = 64 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Create bind group
const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: {
            buffer: uniformBuffer,
        },
    }],
});

// State variables
let pan = [0, 0];
let zoom = 1;
let maxIter = 100;
let t = 0;
let antiAliasing = 2;
let colorScheme = 0;
let highPrecision = false;

function render() {
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        }],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}

function updateUniforms() {
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([
            pan[0],
            pan[1],
            zoom,
            t,
        ])
    );
    device.queue.writeBuffer(
        uniformBuffer,
        16,
        new Uint32Array([
            canvas.width,
            canvas.height,
            maxIter,
            colorScheme,
            antiAliasing,
        ])
    );
    
    // Request new frame
    requestAnimationFrame(render);
}

// Event handlers
function resetView() {
    pan = [0, 0];
    zoom = 1;
    maxIter = 100;
    t = 0;
    
    // Reset UI elements
    document.getElementById('t-slider').value = 0;
    document.getElementById('t-value').textContent = '0';
    document.getElementById('max-iterations-slider').value = 80; // log2(256) * 10
    document.getElementById('max-iterations-value').textContent = '256';
    
    // Update render
    updateUniforms();
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const factor = Math.exp(e.deltaY * 0.001);
    if (e.shiftKey) {
        // Change maxIter logarithmically
        maxIter = Math.max(1, maxIter * factor);
        const maxIterValue = document.getElementById('max-iterations-value');
        const maxIterSlider = document.getElementById('max-iterations-slider');
        maxIterSlider.value = Math.log2(maxIter) * 10;
        maxIterValue.textContent = maxIter;
    } else {
        // Normal zoom behavior
        const oldZoom = zoom;
        zoom *= factor;
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width * 2 - 1) * rect.width / rect.height;
        const y = (e.clientY - rect.top) / rect.height * 2 - 1;
        pan[0] -= x * (1 / zoom - 1 / oldZoom);
        pan[1] += y * (1 / zoom - 1 / oldZoom);
    }

    updateUniforms();
});

let isDragging = false;
let lastX, lastY;

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    pan[0] -= 2 * dx / zoom / canvas.height;
    pan[1] += 2 * dy / zoom / canvas.height;

    updateUniforms();
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
});

function initializeUI() {
    // Reset button
    const resetButton = document.getElementById('reset-button');
    resetButton.addEventListener('click', resetView);

    // Color scheme select
    const colorSchemeSelect = document.getElementById('color-scheme-select');
    colorSchemeSelect.addEventListener('change', (e) => updateColorScheme(e.target.value));

    // T slider
    const tSlider = document.getElementById('t-slider');
    const tValue = document.getElementById('t-value');
    tSlider.addEventListener('input', (e) => {
        updateT(e.target.value);
        tValue.textContent = t.toFixed(4);
    });

    // Anti-aliasing slider
    const aaSlider = document.getElementById('aa-slider');
    const aaValue = document.getElementById('aa-value');
    aaSlider.addEventListener('input', (e) => {
        updateAA(e.target.value);
        aaValue.textContent = antiAliasing;
    });

    // Max iterations slider
    const maxIterSlider = document.getElementById('max-iterations-slider');
    const maxIterValue = document.getElementById('max-iterations-value');
    maxIterSlider.addEventListener('input', (e) => {
        updateMaxIterations(Math.pow(2, 0.1 * e.target.value));
        maxIterValue.textContent = maxIter;
    });

    // Export button
    const exportButton = document.getElementById('export-button');
    exportButton.addEventListener('click', tileExport);

    // High precision checkbox
    const highPrecisionCheckbox = document.getElementById('high-precision-checkbox');
    highPrecisionCheckbox.addEventListener('change', (e) => updateHighPrecision(e.target.checked));
}

// Call this after your WebGPU initialization
initializeUI();

// Initial setup
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateUniforms();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function updateColorScheme(value) {
    colorScheme = parseInt(value);
    updateUniforms();
}

function updateT(value) {
    t = parseFloat(value);
    document.getElementById('t-value').textContent = t.toFixed(4);
    updateUniforms();
}

function updateAA(value) {
    antiAliasing = parseInt(value);
    document.getElementById('aa-value').textContent = antiAliasing;
    updateUniforms();
}

function updateMaxIterations(value) {
    maxIter = Math.floor(value);
    document.getElementById('max-iterations-value').textContent = maxIter;
    updateUniforms();
}

function updateHighPrecision(checked) {
    highPrecision = checked;
    // Reinitialize pipeline with new precision if needed
    initializePipeline().then(() => {
        updateUniforms();
    });
}

async function tileExport() {
    const width = parseInt(document.getElementById('export-width').value);
    const height = parseInt(document.getElementById('export-height').value);
    
    // Create temporary canvas for export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    
    // Render at export resolution
    // ... implement high-resolution render logic ...
    
    // Convert to PNG and download
    const link = document.createElement('a');
    link.download = 'fractal.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}
