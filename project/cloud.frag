#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

uniform mat4 view_inverse;
uniform mat4 model_inverse;
uniform mat4 model;

uniform float density_threshold;
uniform float density_multiplier;
uniform int num_steps;
uniform float cloud_scale;
uniform float cloud_speed;

uniform float time;

in vec4 clip_position;
in vec3 model_position;

layout(binding = 9) uniform sampler3D shapeNoise;
layout(binding = 10) uniform sampler2D screen_color;
layout(binding = 11) uniform sampler2D screen_depth;

layout(location = 0) out vec4 fragmentColor;

float beersLaw(float x){
	return exp(-x);
}

float remap(float value, float low1, float high1, float low2, float high2){
	return low2 + (value - low1) * (high2 - low2) / (high1 - low1);
}

float sampleCloudDensity(vec3 pos){
	vec3 offset = time * cloud_speed * normalize(vec3(1.0, 0.0, 2.0));
	vec4 c = texture(shapeNoise, (pos * 0.01 + offset) * cloud_scale);

	//return remap(max(c.r - density_threshold, 0.0), (0.625 * c.g + 0.25 * c.b + 0.125 * c.a) - 1.0, 1.0, 0.0, 1.0) * density_multiplier;
	return max(0.0, c.r - density_threshold) * density_multiplier;
}

void main()
{
	// Sample color and depth from screen
	vec3 ndc = clip_position.xyz / clip_position.w;
	vec2 screen_position = ndc.xy * 0.5 + 0.5;

	vec4 sampled_color = texture(screen_color, screen_position);
	float sampled_depth = texture(screen_depth, screen_position).r;

	// Get view ray intersections with cloud container
	vec3 model_campos = (model_inverse * view_inverse * vec4(vec3(0.0), 1.0)).xyz;		// Perform itsc check in model space to allow for rotation in world space
	vec3 model_ray = normalize(model_position - model_campos);

	vec3 ts_lower = (vec3(-1.0) - model_campos) / model_ray;
	vec3 ts_upper = (vec3(1.0) - model_campos) / model_ray;

	vec3 ts_min = vec3(min(ts_lower.x, ts_upper.x), min(ts_lower.y, ts_upper.y), min(ts_lower.z, ts_upper.z));
	vec3 ts_max = vec3(max(ts_lower.x, ts_upper.x), max(ts_lower.y, ts_upper.y), max(ts_lower.z, ts_upper.z));

	float t_min = max(ts_min.x, max(ts_min.y, ts_min.z));
	float t_max = min(ts_max.x, min(ts_max.y, ts_max.z));

	vec3 world_itsc_in = (model * vec4(model_campos + model_ray * t_min, 1.0)).xyz;
	vec3 world_itsc_out = (model * vec4(model_campos + model_ray * t_max, 1.0)).xyz;

	// Ray marching
	float density = 0.0;

	vec3 vec_step = (world_itsc_out - world_itsc_in) / num_steps;
	float size_step = length(vec_step);

	int i = 0;
	while(i <= num_steps){
		vec3 sample_pos = world_itsc_in + vec_step * i;
		density += sampleCloudDensity(sample_pos) * size_step;
		i++;
	}


	// Shading
	float transmittance = beersLaw(density);

	// Output color
	//fragmentColor = vec4(vec3(mtp), 1.0);
	vec3 screen_rgb = texture(screen_color, screen_position).rgb;
	fragmentColor = vec4(screen_rgb * transmittance, 1.0);
	//fragmentColor = vec4(screen_position, 0.0, 1.0);
}
