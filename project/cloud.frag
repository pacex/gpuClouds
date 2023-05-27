#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

uniform mat4 proj_inverse;
uniform mat4 pv;
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
uniform float step_size_incr;
uniform float step_size_incr_sun;
uniform float cloud_scale;
uniform float cloud_speed;
uniform float forward_scattering;

uniform vec3 light_direction;
uniform vec3 light_color;

uniform float time;

const float M_PI = 3.14159265358979;

in vec4 clip_position;
in vec3 model_position;

layout(binding = 9) uniform sampler3D shapeNoise;
layout(binding = 10) uniform sampler2D screen_color;
layout(binding = 11) uniform sampler2D screen_depth;

layout(location = 0) out vec4 fragmentColor;

float beersLaw(float x, float d){
	return exp(-x * d);
}

float henyey_greenstein(float cos_angle, float g){
	float g2 = g * g;
	return (1.0 - g2) / (4.0 * M_PI * pow(1.0 + g2 - 2.0 * g * cos_angle, 1.5));
}

float remap(float value, float low1, float high1, float low2, float high2){
	return low2 + (value - low1) * (high2 - low2) / (high1 - low1);
}

float getWorldPosDepth(vec3 pos){
	vec4 clipPos = pv * vec4(pos, 1.0);
	return (clipPos.xyz / clipPos.w).z;
}

float sampleCloudDensity(vec3 pos){
	
	// Shape altering height function
	vec3 model_pos = (model_inverse * vec4(pos, 1.0)).xyz;
	float h = remap(model_pos.y, -1.0, 1.0, 0.0, 1.0);

	float SA_bottom = clamp(h * remap(h, 0.0, 0.07, 0.0, 1.0), 0.0, 1.0);
	float SA_top = clamp(remap(h, 0.3, 1.0, 1.0, 0.0), 0.0, 1.0);


	// Sample density
	vec3 offset = time * cloud_speed * normalize(vec3(1.0, 0.0, 2.0));
	vec4 c = texture(shapeNoise, (pos + offset) * cloud_scale);

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
	float transmittance = 1.0;

	vec3 ray_direction = normalize(world_itsc_out - pos);
	float ray_max = length(world_itsc_out - pos);

	int step_cnt = int(floor(ray_max / step_size_sun));
	float step_last = fract(ray_max / step_size_sun) * step_size_sun;

	int i = 0;
	int step_mtp = 1;
	while(i <= step_cnt){
		vec3 sample_pos = pos + ray_direction * step_size_sun * i;
		float density = sampleCloudDensity(sample_pos) * step_size;
		float weight = i < step_cnt ? step_size_sun * float(step_mtp) : step_last + step_size_sun * float(step_mtp - 1);

		transmittance *= beersLaw(density * weight, light_absorption_sun);

		if (transmittance <= 0.0) break;
		step_mtp = min(int(floor(1.0 / pow(transmittance, step_size_incr_sun))), max(step_cnt - i, 1));

		i += step_mtp;
	}

	return darkness_threshold + transmittance * (1.0 - darkness_threshold);
}

void main()
{
	// Sample color and depth from screen
	vec3 ndc = clip_position.xyz / clip_position.w;
	vec2 screen_position = ndc.xy * 0.5 + 0.5;

	vec4 sampled_color = texture(screen_color, screen_position);
	float sampled_depth = texture(screen_depth, screen_position).r * 2.0 - 1.0;

	if (sampled_depth <= ndc.z) discard;

	vec4 sampled_ndc = vec4(ndc.xy, sampled_depth, 1.0);
	vec4 sampled_world_4 = (view_inverse * proj_inverse * sampled_ndc);
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
	float cos_angle = dot(ray_direction, light_direction);

	float ray_max = length(world_itsc_out - world_itsc_in); // Cut off ray when it hits geometry (i.e depth exceeds depth buffer)
	ray_max = max(min(ray_max, dot(sampled_world - world_itsc_in, ray_direction)), 0.0);

	vec3 world_position = (model * vec4(model_position, 1.0)).xyz; // TODO: get min ray cutoff to work
	//float ray_min = max(0.0, dot(world_position - world_itsc_in, ray_direction));

	//float ray_len = max(0.0, ray_max - ray_min);

	int step_cnt = int(floor(ray_max / step_size));
	float step_last = fract(ray_max / step_size) * step_size;
	int step_mtp = 1;

	int i = 0;
	
	while(i <= step_cnt){
		vec3 sample_pos = world_itsc_in + ray_direction * (step_size * i);
		float density = sampleCloudDensity(sample_pos);

		float weight = i < step_cnt ? step_size * float(step_mtp) : step_last + step_size * float(step_mtp - 1);

		if (density > 0.0){
			// Amount of light sampled point receives from the sun
			float light_transmittance = marchLightRay(sample_pos) * max(henyey_greenstein(cos_angle, forward_scattering), 1.0);
			light_energy += density * transmittance * light_transmittance * weight;

			// Amount of light reaching camera from this point
			transmittance *= beersLaw(density * weight, light_absorption);
		}

		if (transmittance <= 0.0) break;
		step_mtp = min(int(floor(1.0 / pow(transmittance, step_size_incr))), max(step_cnt - i, 1));

		i += step_mtp;
	}


	// Blend between screen- and cloud color
	vec3 screen_rgb = texture(screen_color, screen_position).rgb;
	vec3 cloud_rgb = light_color * light_energy;

	fragmentColor = vec4(screen_rgb * transmittance + cloud_rgb, 1.0);
}
