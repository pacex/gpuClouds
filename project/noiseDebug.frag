#version 420

layout(location = 0) out vec4 fragmentColor;
layout(binding = 9) uniform sampler3D noiseTexture;
in vec2 texCoord;
uniform float layer;
uniform int channel;

void main()
{
	vec4 sampledColor = texture(noiseTexture, vec3(texCoord, layer));
	
	fragmentColor = vec4(vec3(sampledColor.r), 1.0);
	if (channel == 1) fragmentColor = vec4(vec3(sampledColor.g), 1.0);
	else if (channel == 2) fragmentColor = vec4(vec3(sampledColor.b), 1.0);
	else if (channel == 3) fragmentColor = vec4(vec3(sampledColor.a), 1.0);

	gl_FragDepth = 0.0;
}