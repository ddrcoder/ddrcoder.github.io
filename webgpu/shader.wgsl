struct Uniforms {
    pan: vec2f,
    zoom: f32,
    max_iter: f32,
    t: f32,
    width: f32,
    height: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let pos = array(
        vec2f(-1.0, -1.0),
        vec2f(1.0, -1.0),
        vec2f(-1.0, 1.0),
        vec2f(1.0, -1.0),
        vec2f(1.0, 1.0),
        vec2f(-1.0, 1.0),
    );

    var output: VertexOutput;
    output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
    output.uv = pos[vertexIndex];
    return output;
}

alias F64 = vec2f;
alias C64 = vec4f;

fn f64add(a: F64, b: F64) -> F64 {
    let xh = a.x;
    let xl = a.y;
    let yh = b.x;
    let yl = b.y;

    let sh = xh + yh;
    let sl = xl + yl;
    let c = sl + (xh - (sh - yh)) + (yh - (sh - xh));
    let zh = sh + c;
    let zl = c - (zh - sh);

    return F64(zh, zl);
}

fn f64mul(x: F64, y: F64) -> F64 {
    let xh = x.x;
    let xl = x.y;
    let yh = y.x;
    let yl = y.y;

    let p = xh * yh;
    let q = xh * yl + xl * yh;
    let zh = p + q;
    let zl = q - (zh - p);

    return F64(zh, zl);
}

fn c64add(a: C64, b: C64) -> C64 {
    return C64(
        f64add(a.xy, b.xy),
        f64add(a.zw, b.zw)
    );
}

fn c64mul(a: C64, b: C64) -> C64 {
    return C64(
        f64add(f64mul(a.xy, b.xy), -f64mul(a.zw, b.zw)),
        f64add(f64mul(a.xy, b.zw), f64mul(a.zw, b.xy))
    );
}

fn f64mag2(f: F64) -> f32 {
    return f.x * f.x + 2.0 * f.x * f.y + f.y * f.y;
}

fn c64mag2(c: C64) -> f32 {
    return f64mag2(c.xy) + f64mag2(c.zw);
}

fn iterate(z: C64, c: C64) -> f32 {
    var z_current = z;
    for (var i: i32 = 0; i < 8192; i++) {
        if (f32(i) >= uniforms.max_iter) { break; }
        z_current = c64add(c64mul(z_current, z_current), c);
        let mag2 = c64mag2(z_current);
        if (mag2 > 64.0) {
            return (f32(i) - log2(log2(mag2)) + 4.0) / uniforms.max_iter;
        }
    }
    return 1.0;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let aspect = uniforms.width / uniforms.height;
    let uv = input.uv  * vec2f(aspect, 1.0) / uniforms.zoom + uniforms.pan;
    
    let c = C64(F64(uv.x, 0.0), F64(uv.y, 0.0));
    let z = C64(F64(0.0, 0.0), F64(0.0, 0.0));
    
    let t = iterate(z, c);
    
    // Color mapping
    let color = vec3f(
        0.5 + 0.5 * cos(3.0 + t * 6.28 + vec3f(0.0, 0.6, 1.0))
    );
    
    return vec4f(color, 1.0);
}
