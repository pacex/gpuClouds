#include "noiseGenerator.h"
#include <GL/glew.h>
#include <iostream>
#include <labhelper.h>

#include <glm/glm.hpp>
#include <glm/gtx/transform.hpp>
using namespace glm;

NoiseGenerator::NoiseGenerator(){

	// Create 3D noise texture
	NT_SIZE = 128;
	glGenTextures(1, &noiseTexture);
	glBindTexture(GL_TEXTURE_3D, noiseTexture);
	glTexImage3D(GL_TEXTURE_3D, 0, GL_RGBA, NT_SIZE, NT_SIZE, NT_SIZE, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_MIRRORED_REPEAT);
	glBindTexture(GL_TEXTURE_3D, 0);

	// Load Noise Shader
	shader = labhelper::loadShaderProgram("../project/fullscreenQuad.vert", "../project/noise.frag");
	debugShader = labhelper::loadShaderProgram("../project/noiseDebug.vert", "../project/noiseDebug.frag");
}

void NoiseGenerator::renderNoise() {

	// Scatter points
	const int CELL_COUNT = 8; // Change to cell count here requires change to cell count in shader
	float* points = generatePointBuffer(CELL_COUNT); 


	unsigned int framebuffer;
	glGenFramebuffers(1, &framebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);

	for (int i = 0; i < NT_SIZE; i++) {
		glFramebufferTexture3D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_3D, noiseTexture, 0, i);
		glViewport(0, 0, NT_SIZE, NT_SIZE);
		glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

		glUseProgram(shader);
		labhelper::setUniformSlow(shader, "layer", i);
		labhelper::setUniformSlow(shader, "size", NT_SIZE);
		//labhelper::setUniformSlow(shader, "scattered_points", points);
		glUniform3fv(glGetUniformLocation(shader, "scattered_points"), CELL_COUNT * CELL_COUNT * CELL_COUNT, points);
		labhelper::drawFullScreenQuad();
	}

	glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void NoiseGenerator::debugDraw(float layer, float screenRatio) {

	glActiveTexture(GL_TEXTURE9);
	glBindTexture(GL_TEXTURE_3D, noiseTexture);
	glUseProgram(debugShader);
	labhelper::setUniformSlow(debugShader, "layer", layer);
	labhelper::setUniformSlow(debugShader, "screenRatio", screenRatio);
	labhelper::drawFullScreenQuad();
}

float NoiseGenerator::randf() {
	return (float)rand() / (float)RAND_MAX;
}

float* NoiseGenerator::generatePointBuffer(int N) {

	float* cells;
	cells = new float[N * N * N * 3];

	for (int x = 0; x < N; x++) {
		for (int y = 0; y < N; y++) {
			for (int z = 0; z < N; z++) {
				vec3 cell_min = vec3((float)x / N, (float)y / N, (float)z / N);
				vec3 cell_max = vec3((float)(x+1) / N, (float)(y+1) / N, (float)(z+1) / N);
				
				vec3 random_point = vec3(randf(), randf(), randf());
				vec3 point = cell_min + random_point * (cell_max - cell_min);

				cells[x*N*N*3 + y*N*3 + z*3] = point.x;
				cells[x * N * N * 3 + y * N * 3 + z * 3 + 1] = point.y;
				cells[x * N * N * 3 + y * N * 3 + z * 3 + 2] = point.z;
			}
		}
	}

	return cells;

}