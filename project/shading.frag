#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color = vec3(1, 1, 1);
uniform float material_metalness = 0;
uniform float material_fresnel = 0;
uniform float material_shininess = 0;
uniform vec3 material_emission = vec3(0);

uniform int has_color_texture = 0;
layout(binding = 0) uniform sampler2D colorMap;
uniform int has_emission_texture = 0;
layout(binding = 5) uniform sampler2D emissiveMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;

vec2 directionToSpherical(vec3 dir){
	// Calculate the spherical coordinates of the direction
	float theta = acos(max(-1.0f, min(1.0f, dir.y)));
	float phi = atan(dir.z, dir.x);
	if(phi < 0.0f)
		phi = phi + 2.0f * PI;
	// Use these to lookup the color in the environment map
	vec2 lookup = vec2(phi / (2.0 * PI), 1 - theta / PI);
	return lookup;
}

vec3 calculateDirectIllumiunation(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 wi = viewSpaceLightPosition - viewSpacePosition;
	float distanceToLight = length(wi);
	vec3 Li = point_light_intensity_multiplier * point_light_color * (1 / pow(distanceToLight, 2.0));

	wo = normalize(wo);
	wi = normalize(wi);

	if (dot(n, wi) <= 0.0) return vec3(0.0);

	vec3 diffuse_term = base_color * (1.0 / PI) * dot(n, wi) * Li;

	vec3 wh = normalize(wo + wi);

	float fresnel = material_fresnel + (1.0 - material_fresnel) * pow(1.0 - dot(wh, wi), 5.0);
	float micrf_distr = ((material_shininess + 2.0) / (2.0 * PI)) * pow(dot(n, wh), material_shininess);
	float mask = min(1.0, min(2.0 * ((dot(n, wh) * dot(n, wo)) / dot(wo, wh)), 2.0 * ((dot(n, wh) * dot(n, wi)) / dot(wo, wh))));

	float brdf = (fresnel * micrf_distr * mask) / (4.0 * dot(n, wo) * dot(n, wi));

	vec3 dielectric_term = brdf * dot(n, wi) * Li + (1.0 - fresnel) * diffuse_term;
	vec3 metal_term = brdf * base_color * dot(n, wi) * Li;


	return mix(dielectric_term, metal_term, material_metalness);
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 wi = normalize(reflect(wo, n));

	vec3 worldSpaceNormal = (viewInverse * vec4(n, 0.0)).xyz;
	vec2 lookup = directionToSpherical(worldSpaceNormal);

	vec3 diffuse_term = base_color * (1.0 / PI) * texture(irradianceMap, lookup).rgb;

	float roughness = sqrt(sqrt(2.0 / (material_shininess + 2.0)));
	vec3 wh = normalize(wo + wi);
	float fresnel = material_fresnel + (1.0 - material_fresnel) * pow(1.0 - dot(wh, wi), 5.0);

	vec3 worldSpaceWi = (viewInverse * vec4(wi, 0.0)).xyz;
	lookup = directionToSpherical(worldSpaceWi);
	vec3 Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).rgb;

	vec3 dielectric_term = fresnel * Li + (1.0 - fresnel) * diffuse_term;
	vec3 metal_term = fresnel * base_color * Li;

	return mix(dielectric_term, metal_term, material_metalness);
}

void main()
{
	float visibility = 1.0;
	float attenuation = 1.0;

	vec3 wo = -normalize(viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	vec3 base_color = material_color;
	if(has_color_texture == 1)
	{
		base_color = base_color * texture(colorMap, texCoord).rgb;
	}

	// Direct illumination
	vec3 direct_illumination_term = visibility * calculateDirectIllumiunation(wo, n, base_color);

	// Indirect illumination
	vec3 indirect_illumination_term = calculateIndirectIllumination(wo, n, base_color);

	///////////////////////////////////////////////////////////////////////////
	// Add emissive term. If emissive texture exists, sample this term.
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission * material_color;
	if(has_emission_texture == 1)
	{
		emission_term = texture(emissiveMap, texCoord).rgb;
	}

	vec3 shading = direct_illumination_term + indirect_illumination_term + emission_term;

	fragmentColor = vec4(shading, 1.0);
	return;
}
