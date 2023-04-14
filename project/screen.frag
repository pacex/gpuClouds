#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

layout(location = 0) out vec4 fragmentColor;
layout(binding = 10) uniform sampler2D screenColor;
layout(binding = 11) uniform sampler2D screenDepth;
in vec2 texCoord;

void main()
{	
	//fragmentColor = vec4(vec3(texture(screenDepth, texCoord).r), 1.0);
	fragmentColor = texture(screenColor, texCoord);
}
