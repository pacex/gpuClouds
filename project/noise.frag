#version 420

layout(location = 0) out vec4 fragmentColor;
in vec2 texCoord;

uniform int layer;

void main()
{
	fragmentColor = vec4(texCoord, float(layer) / 64.0, 1.0);
}