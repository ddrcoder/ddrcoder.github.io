struct Uniforms {
    pan: vec2f,
    zoom: f32,
    t: f32,
    area: vec2f,
    max_iter: u32,
    color_scheme: u32,
    aa: u32,
    high_precision: u32,
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

fn f64mul(x: F64, y: F64) -> F64 {
    return vec2f(x.x * y.x, x.x * y.y + x.y * y.x + x.y * y.y);
}

fn f64sq(v: F64) -> F64 {
    return f64mul(v, v);
}

fn c64sq(v: C64) -> C64 {
    return C64(
        f64sq(v.xy) - f64sq(v.zw),
        (2.0 + uniforms.t) * f64mul(v.zw, v.xy)
    );
}

fn f64mag2(f: F64) -> f32 {
    return f.x * f.x + 2.0 * f.x * f.y + f.y * f.y;
}

fn c64mag2(c: C64) -> f32 {
    return f64mag2(c.xy) + f64mag2(c.zw);
}

fn iterate_high_precision(z0: C64, c: C64) -> f32 {
    var z = z0;
    for (var i: u32 = 0; i < uniforms.max_iter; i++) {
        z = c64sq(z) + c;
        let mag2 = c64mag2(z);
        if (mag2 > 64.0) {
            return (f32(i) - log2(log2(mag2)) + 4.0) / f32(uniforms.max_iter);
        }
    }
    return 1.0;
}

fn iterate_low_precision(z0: vec2f, c: vec2f) -> f32 {
    var z = z0;
    for (var i: u32 = 0; i < uniforms.max_iter; i++) {
        z = vec2f(z.x * z.x - z.y * z.y, (2.0 + uniforms.t) * z.x * z.y) + c;
        let mag2 = z.x * z.x + z.y * z.y;
        if (mag2 > 64.0) {
            return (f32(i) - log2(log2(mag2)) + 4.0) / f32(uniforms.max_iter);
        }
    }
    return 1.0;
}

fn to_frame(uv: vec2f, offset: vec2f) -> vec2f {
    return (uv * uniforms.area + fract(offset) - vec2f(0.5)) / uniforms.area.y;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Accumulate samples for antialiasing
    let aa = uniforms.aa;
    let aa_max = 1 + aa * aa;
    let aa_grad = vec2f(f32(aa), 1.0) / f32(aa_max);
    var color = vec3f(0.0);
    var offset = vec2f(0.0);

    for (var a: u32 = 0; a < aa_max; a++) {
        let uv = vec4f(uniforms.pan, to_frame(input.uv, offset) / uniforms.zoom);

        var t = 0.;
        if (uniforms.high_precision == 0) {
            t = iterate_low_precision(vec2f(0), uv.xy + uv.zw);
        } else {
            t = iterate_high_precision(C64(0), uv.xzyw);
        }
        var tap = vec3f(0.0);
        if (t < 0.0) {
            tap = vec3f(0.0, 1.0, 0.0);
        } else if (uniforms.color_scheme == 1) {
            tap = vec3f(
                clamp(t * 3. - 0., 0.0, 1.0),
                clamp(t * 3. - 1., 0.0, 1.0),
                clamp(t * 3. - 2., 0.0, 1.0)
            );
        } else if (uniforms.color_scheme == 0) {
            tap = vec3f(
                clamp(t * 3. - 2., 0.0, 1.0),
                clamp(t * 3. - 1., 0.0, 1.0),
                clamp(t * 3. - 0., 0.0, 1.0)
            );
        }
        color += tap;
        offset += aa_grad;
    }

    color /= f32(aa_max);
    
    return vec4f(color, 1.0);
}
