#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

uniform mat4 pv_inverse;
uniform mat4 view_inverse;
uniform mat4 view;
uniform mat4 model_inverse;
uniform mat4 model;

uniform float density_threshold;
uniform float density_multiplier;
uniform float light_absorption;
uniform float light_absorption_sun;
uniform float darkness_threshold;
uniform float step_size_sun;
uniform float step_size;
uniform float cloud_scale;
uniform float cloud_speed;

uniform vec3 light_direction;
uniform vec3 light_color;

uniform float time;

in vec4 clip_position;
in vec3 model_position;

layout(binding = 9) uniform sampler3D shapeNoise;
layout(binding = 10) uniform sampler2D screen_color;
layout(binding = 11) uniform sampler2D screen_depth;

layout(location = 0) out vec4 fragmentColor;

float beersLaw(float x, float d){
	return exp(-x * d);
}

float remap(float value, float low1, float high1, float low2, float high2){
	return low2 + (value - low1) * (high2 - low2) / (high1 - low1);
}

float sampleCloudDensity(vec3 pos){
	
	// Shape altering height function
	vec3 model_pos = (model_inverse * vec4(pos, 1.0)).xyz;
	float h = remap(model_pos.y, -1.0, 1.0, 0.0, 1.0);

	float SA_bottom = clamp(h * remap(h, 0.0, 0.07, 0.0, 1.0), 0.0, 1.0);
	float SA_top = clamp(remap(h, 0.3, 1.0, 1.0, 0.0), 0.0, 1.0);


	// Sample density
	vec3 offset = time * cloud_speed * normalize(vec3(1.0, 0.0, 2.0));
	vec4 c = texture(shapeNoise, (pos * 0.01 + offset) * cloud_scale);

	// Combine shape and detail noise
	float density = max(0.0, remap(c.r, (0.625 * c.g + 0.25 * c.b + 0.125 * c.a) - 1.0, 1.0, 0.0, 1.0) - density_threshold) * density_multiplier;
	return density * SA_bottom * SA_top;
}

float marchLightRay(vec3 pos){

	// Determine ray length
	vec3 model_origin = (model_inverse * vec4(pos, 1.0)).xyz;
	vec3 model_dir = (transpose(model) * vec4(light_direction, 0.0)).xyz;

	vec3 ts_lower = (vec3(-1.0) - model_origin) / model_dir;
	vec3 ts_upper = (vec3(1.0) - model_origin) / model_dir;

	vec3 ts_max = vec3(max(ts_lower.x, ts_upper.x), max(ts_lower.y, ts_upper.y), max(ts_lower.z, ts_upper.z));
	float t_max = min(ts_max.x, min(ts_max.y, ts_max.z));
	vec3 world_itsc_out = (model * vec4(model_origin + model_dir * t_max, 1.0)).xyz;

	// Ray marching
	float density = 0.0;

	vec3 ray_direction = normalize(world_itsc_out - pos);
	float ray_max = length(world_itsc_out - pos);

	int step_cnt = int(floor(ray_max / step_size_sun));
	float step_last = fract(ray_max / step_size_sun) * step_size_sun;

	int i = 0;
	while(i < step_cnt){
		vec3 sample_pos = pos + ray_direction * step_size_sun * i;
		density += sampleCloudDensity(sample_pos) * step_size;
		i++;
	}

		// Last step
	vec3 sample_pos = pos + ray_direction * step_size_sun * step_cnt;
	density += sampleCloudDensity(sample_pos) * step_last;

	// Compute transmittance
	float transmittance = beersLaw(density, light_absorption_sun);

	return darkness_threshold + transmittance * (1.0 - darkness_threshold);
}

void main()
{
	// Sample color and depth from screen
	vec3 ndc = clip_position.xyz / clip_position.w;
	vec2 screen_position = ndc.xy * 0.5 + 0.5;

	vec4 sampled_color = texture(screen_color, screen_position);
	float sampled_depth = texture(screen_depth, screen_position).r;

	vec4 sampled_ndc = vec4(ndc.xy, sampled_depth, 1.0);
	vec4 sampled_world_4 = (pv_inverse * sampled_ndc);
	vec3 sampled_world = sampled_world_4.xyz / sampled_world_4.w;

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
	float transmittance = 1.0;
	float light_energy = 0.0;

	vec3 ray_direction = normalize(world_itsc_out - world_itsc_in);

	float ray_max = length(world_itsc_out - world_itsc_in); // Cut off ray when it hits geometry (i.e depth exceeds depth buffer)
	ray_max = max(min(ray_max, dot(sampled_world - world_itsc_in, ray_direction)), 0.0);

	vec3 world_position = (model * vec4(model_position, 1.0)).xyz; // TODO: get min ray cutoff to work
	float ray_min = max(0.0, dot(world_position - world_itsc_in, ray_direction));

	float ray_len = max(0.0, ray_max - ray_min);

	int step_cnt = int(floor(ray_len / step_size));
	float step_last = fract(ray_len / step_size) * step_size;

	int i = 0;
	while(i < step_cnt){
		vec3 sample_pos = world_itsc_in + ray_direction * (step_size * i + ray_min);
		float density = sampleCloudDensity(sample_pos);

		if (density > 0.0){
			float light_transmittance = marchLightRay(sample_pos);
			light_energy += density * transmittance * light_transmittance * step_size;
			transmittance *= beersLaw(density * step_size, light_absorption);
		}
		i++;
	}

	if (step_last > 0.0){ // Last step
		vec3 sample_pos = world_itsc_in + ray_direction * (step_size * step_cnt + ray_min);
		float density = sampleCloudDensity(sample_pos);

		if (density > 0.0){
			float light_transmittance = marchLightRay(sample_pos);
			light_energy += density * transmittance * light_transmittance * step_last;
			transmittance *= beersLaw(density * step_last, light_absorption);
		}
	}
		
	// Shading

	// Output color
	//fragmentColor = vec4(vec3(mtp), 1.0);
	vec3 screen_rgb = texture(screen_color, screen_position).rgb;
	vec3 cloud_rgb = light_color * light_energy;


	fragmentColor = vec4(screen_rgb * transmittance + cloud_rgb, 1.0);
	//fragmentColor = vec4(light_color, 1.0);
	
}
