#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

// Matrices
uniform mat4 proj_inverse;
uniform mat4 pv;
uniform mat4 view_inverse;
uniform mat4 view;

// Container Dimensions
uniform vec3 container_min;
uniform vec3 container_max;

// Parameters
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
uniform float blue_noise_offset_factor;

// Light Source
uniform vec3 light_direction;
uniform vec3 light_color;

// Time
uniform float time;

const float M_PI = 3.14159265358979;

in vec2 texCoord;

layout(binding = 9) uniform sampler3D shapeNoise;
layout(binding = 10) uniform sampler2D screen_color;
layout(binding = 11) uniform sampler2D screen_depth;
layout(binding = 13) uniform sampler2D sample_offset_texture; // Blue noise texture

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

float sampleCloudDensity(vec3 pos){
	
	// Shape altering height function
	float h = remap(pos.y, container_min.y, container_max.y, 0.0, 1.0);

	float SA_bottom = clamp(h * remap(h, 0.0, 0.07, 0.0, 1.0), 0.0, 1.0);
	float SA_top = clamp(remap(h, 0.3, 1.0, 1.0, 0.0), 0.0, 1.0);


	// Sample density
	vec3 offset = time * cloud_speed * normalize(vec3(1.0, 0.0, 2.0));
	vec4 c = texture(shapeNoise, (pos + offset) * cloud_scale * 0.01);

	// Combine shape and detail noise
	float density = max(0.0, remap(c.r, (0.625 * c.g + 0.25 * c.b + 0.125 * c.a) - 1.0, 1.0, 0.0, 1.0) - density_threshold) * density_multiplier;
	return density * SA_bottom * SA_top;
}

float marchLightRay(vec3 pos){

	// Determine ray length
	vec3 ts_lower = (container_min - pos) / light_direction;
	vec3 ts_upper = (container_max - pos) / light_direction;

	vec3 ts_max = vec3(max(ts_lower.x, ts_upper.x), max(ts_lower.y, ts_upper.y), max(ts_lower.z, ts_upper.z));
	float t_max = max(0.0, min(ts_max.x, min(ts_max.y, ts_max.z)));
	vec3 itsc_out = pos + t_max * light_direction;

	// Ray marching
	float transmittance = 1.0;

	if (t_max > 0.0){

		int step_cnt = int(floor(t_max / step_size_sun));
		float step_last = fract(t_max / step_size_sun) * step_size_sun;

		int i = 0;
		int step_mtp = 1;
		while(i <= step_cnt){
			vec3 sample_pos = pos + light_direction * step_size_sun * i;
			float weight = i < step_cnt ? step_size_sun * float(step_mtp) : step_last + step_size_sun * float(step_mtp - 1);

			float density = sampleCloudDensity(sample_pos);
		
			transmittance *= beersLaw(density * weight, light_absorption_sun);

			if (transmittance <= 0.0) break;
			step_mtp = min(int(floor(1.0 / pow(transmittance, step_size_incr_sun))), max(step_cnt - i, 1));

			i += step_mtp;
		}
	}
	
	return darkness_threshold + transmittance * (1.0 - darkness_threshold);
}

void main()
{
	// Sample color and depth from screen
	vec4 sampled_color = texture(screen_color, texCoord);
	float sampled_depth = texture(screen_depth, texCoord).r * 2.0 - 1.0;

	vec4 sampled_ndc = vec4(texCoord * 2.0 - 1.0, sampled_depth, 1.0);
	vec4 sampled_world_4 = (view_inverse * proj_inverse * sampled_ndc);
	vec3 sampled_world = sampled_world_4.xyz / sampled_world_4.w;		// Reconstruct world space position of possibly occluding geometry

	// Get view ray intersections with cloud container

	// Calculate the world-space position of this fragment on the near plane
	vec4 pixel_world_pos = view_inverse * proj_inverse * vec4(texCoord * 2.0 - 1.0, 1.0, 1.0);
	pixel_world_pos = (1.0 / pixel_world_pos.w) * pixel_world_pos;

	// Calculate the world-space direction from the camera to that position
	vec3 world_campos = (view_inverse * vec4(vec3(0.0), 1.0)).xyz;
	vec3 world_dir = normalize(pixel_world_pos.xyz - world_campos);


	vec3 ts_lower = (container_min - world_campos) / world_dir;
	vec3 ts_upper = (container_max - world_campos) / world_dir;

	vec3 ts_min = vec3(min(ts_lower.x, ts_upper.x), min(ts_lower.y, ts_upper.y), min(ts_lower.z, ts_upper.z));
	vec3 ts_max = vec3(max(ts_lower.x, ts_upper.x), max(ts_lower.y, ts_upper.y), max(ts_lower.z, ts_upper.z));

	float t_min = max(0.0, max(ts_min.x, max(ts_min.y, ts_min.z)));
	float t_max = max(0.0, min(ts_max.x, min(ts_max.y, ts_max.z)));

	t_max = max(min(t_max, dot(sampled_world - world_campos, world_dir)), 0.0);	// Cut off ray when it hits geometry (i.e depth exceeds depth buffer)

	// Ray marching
	float transmittance = 1.0;
	float light_energy = 0.0;

	if (t_max > t_min){
		float cos_angle = dot(world_dir, light_direction);			// Angle between view and light direction for forward scattering

		float ray_len = t_max - t_min;

		int step_cnt = int(floor(ray_len / step_size));
		float step_last = fract(ray_len / step_size) * step_size;	// Length of last step
		int step_mtp = 1;

		int i = 0;
		while(i <= step_cnt){	// Ray marching loop
			vec3 sample_pos = world_campos + world_dir * (t_min + step_size * i);

			if (blue_noise_offset_factor > 0.0){	// Offset sample position
				vec4 sample_ndc_pos = pv * vec4(sample_pos, 1.0);
				sample_ndc_pos /= sample_ndc_pos.w;
				vec2 sample_screen_pos = sample_ndc_pos.xy * 0.5 + 0.5;

				float sample_offset = 0.0;

				sample_offset = (texture(sample_offset_texture, sample_screen_pos).r * 2.0 - 1.0) * blue_noise_offset_factor;
				sample_pos += sample_offset * world_dir;
			}

			float density = sampleCloudDensity(sample_pos);	// Sample density volume

			// Weight of current step proportional to step length
			float weight = i < step_cnt ? step_size * float(step_mtp) : step_last + step_size * float(step_mtp - 1);
		
			if (density > 0.0){ // Skip marching light ray if density sample == 0
				// Amount of light sampled point receives from the sun
				float light_transmittance = marchLightRay(sample_pos) * max(henyey_greenstein(cos_angle, forward_scattering), 1.0);
				light_energy += density * transmittance * light_transmittance * weight;

				// Amount of light reaching camera from this point
				transmittance *= beersLaw(density * weight, light_absorption);
			}

			if (transmittance <= 0.0) break;	// Stop marching if transmittance reaches 0
			step_mtp = min(int(floor(1.0 / pow(transmittance, step_size_incr))), max(step_cnt - i, 1)); // Skip steps if transmittance is low enough

			i += step_mtp;
		}
	}

	// Blend between screen- and cloud color
	vec3 screen_rgb = texture(screen_color, texCoord).rgb;
	vec3 cloud_rgb = light_color * light_energy;

	fragmentColor = vec4(screen_rgb * transmittance + cloud_rgb, 1.0);
}
