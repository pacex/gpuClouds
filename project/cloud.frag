#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

uniform mat4 view_inverse;
uniform mat4 model_inverse;
uniform mat4 model;

in vec4 clip_position;
in vec3 model_position;

layout(binding = 9) uniform sampler3D noise;
layout(binding = 10) uniform sampler2D screen_color;
layout(binding = 11) uniform sampler2D screen_depth;

layout(location = 0) out vec4 fragmentColor;

float beersLaw(float x){
	return exp(-x / 30.0);
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
	// ...TODO...

	// Shading
	float mtp = beersLaw(length(world_itsc_out - world_itsc_in));

	// Output color
	//fragmentColor = vec4(vec3(gl_FragCoord.z), 1.0);
	vec3 screen_rgb = texture(screen_color, screen_position).rgb;
	fragmentColor = vec4(screen_rgb * mtp, 1.0);
	//fragmentColor = vec4(screen_position, 0.0, 1.0);
}
