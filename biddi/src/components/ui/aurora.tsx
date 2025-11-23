"use client";

import { useEffect, useRef } from "react";

type AuroraProps = {
  colorStops?: string[];
  blend?: number;
  amplitude?: number;
  speed?: number;
};

export default function Aurora({
  colorStops = ["#000000", "#333333", "#666666"],
  blend = 0.5,
  amplitude = 1.0,
  speed = 0.5,
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.warn("WebGL not supported");
      return;
    }
    glRef.current = gl;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Fragment shader with aurora effect
    const fragmentShaderSource = `
      precision mediump float;

      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;
      uniform float u_blend;
      uniform float u_amplitude;

      // Simplex noise function
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                                dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;

        // Create flowing aurora waves
        float noise1 = snoise(vec2(uv.x * 2.0 + u_time * 0.1, uv.y * 1.5)) * u_amplitude;
        float noise2 = snoise(vec2(uv.x * 3.0 - u_time * 0.15, uv.y * 2.0 + u_time * 0.1)) * u_amplitude;
        float noise3 = snoise(vec2(uv.x * 1.5 + u_time * 0.08, uv.y * 2.5 - u_time * 0.05)) * u_amplitude;

        // Vertical gradient base
        float gradient = uv.y;

        // Aurora bands
        float band1 = smoothstep(0.0, 0.5, sin((uv.y + noise1 * 0.3) * 3.14159 * 2.0) * 0.5 + 0.5);
        float band2 = smoothstep(0.0, 0.5, sin((uv.y + noise2 * 0.25 + 0.3) * 3.14159 * 2.5) * 0.5 + 0.5);
        float band3 = smoothstep(0.0, 0.5, sin((uv.y + noise3 * 0.2 + 0.6) * 3.14159 * 1.8) * 0.5 + 0.5);

        // Mix colors based on bands and noise
        vec3 color = u_color1 * band1 * (0.5 + noise1 * 0.5);
        color += u_color2 * band2 * (0.5 + noise2 * 0.5);
        color += u_color3 * band3 * (0.5 + noise3 * 0.5);

        // Apply blend and fade edges
        float fadeTop = smoothstep(1.0, 0.7, uv.y);
        float fadeBottom = smoothstep(0.0, 0.3, uv.y);
        float fade = fadeTop * fadeBottom;

        color *= fade * u_blend;

        // Add subtle glow
        color += u_color2 * 0.05 * (1.0 - uv.y);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Compile shader helper
    const compileShader = (
      source: string,
      type: number,
    ): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(
      fragmentShaderSource,
      gl.FRAGMENT_SHADER,
    );
    if (!vertexShader || !fragmentShader) return;

    // Create program
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Set up geometry (full-screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const color1Location = gl.getUniformLocation(program, "u_color1");
    const color2Location = gl.getUniformLocation(program, "u_color2");
    const color3Location = gl.getUniformLocation(program, "u_color3");
    const blendLocation = gl.getUniformLocation(program, "u_blend");
    const amplitudeLocation = gl.getUniformLocation(program, "u_amplitude");

    // Parse hex colors to RGB
    const hexToRgb = (hex: string): [number, number, number] => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
          ]
        : [0, 0, 0];
    };

    const color1 = hexToRgb(colorStops[0] || "#000000");
    const color2 = hexToRgb(colorStops[1] || "#333333");
    const color3 = hexToRgb(colorStops[2] || "#666666");

    // Set static uniforms
    gl.uniform3fv(color1Location, color1);
    gl.uniform3fv(color2Location, color2);
    gl.uniform3fv(color3Location, color3);
    gl.uniform1f(blendLocation, blend);
    gl.uniform1f(amplitudeLocation, amplitude);

    // Animation loop
    const startTime = Date.now();

    const render = () => {
      const currentGl = glRef.current;
      const currentCanvas = canvasRef.current;
      if (!currentGl || !currentCanvas) return;

      // Handle resize
      const displayWidth = currentCanvas.clientWidth;
      const displayHeight = currentCanvas.clientHeight;
      if (
        currentCanvas.width !== displayWidth ||
        currentCanvas.height !== displayHeight
      ) {
        currentCanvas.width = displayWidth;
        currentCanvas.height = displayHeight;
        currentGl.viewport(0, 0, currentCanvas.width, currentCanvas.height);
      }

      const time = ((Date.now() - startTime) / 1000) * speed;
      currentGl.uniform2f(
        resolutionLocation,
        currentCanvas.width,
        currentCanvas.height,
      );
      currentGl.uniform1f(timeLocation, time);
      currentGl.drawArrays(currentGl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
      glRef.current = null;
    };
  }, [colorStops, blend, amplitude, speed]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: "#ffffff" }}
    />
  );
}
