#version 420

layout(location = 0) in vec3 position;

uniform mat4 modelViewProjectionMatrix;

out vec4 clip_position;
out vec3 model_position;

void main()
{
	gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
	
	clip_position = gl_Position;
	model_position = position;
}
