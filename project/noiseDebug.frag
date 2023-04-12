#version 420

layout(location = 0) out vec4 fragmentColor;
layout(binding = 9) uniform sampler3D noiseTexture;
in vec2 texCoord;
uniform float layer;

void main()
{
	vec4 sampledColor = texture(noiseTexture, vec3(texCoord, layer));
	fragmentColor = vec4(sampledColor.rgb, 1.0);
}