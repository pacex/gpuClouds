#version 420
// This vertex shader simply outputs the input coordinates to the rasterizer. It only uses 2D coordinates.
layout(location = 0) in vec2 position;

out vec4 clip_position;
out vec3 model_position;

uniform mat4 inv_PVM;

void main()
{
	gl_Position = vec4(position, 0.0, 1.0);
	clip_position = gl_Position;

	vec4 pixel_model_pos = inv_PVM * vec4(gl_Position.xy, 1.0, 1.0);
	model_position = pixel_model_pos.xyz / pixel_model_pos.w;
}
