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
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_REPEAT);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_REPEAT);
	glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_REPEAT);
	glBindTexture(GL_TEXTURE_3D, 0);

	// Load Noise Shader
	shader = labhelper::loadShaderProgram("../project/fullscreenQuad.vert", "../project/noise.frag");
	debugShader = labhelper::loadShaderProgram("../project/noiseDebug.vert", "../project/noiseDebug.frag");
}

void NoiseGenerator::renderNoise() {



	unsigned int framebuffer;
	glGenFramebuffers(1, &framebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);

	for (int i = 0; i < NT_SIZE; i++) { // Iterate over layers
		glFramebufferTexture3D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_3D, noiseTexture, 0, i);
		glViewport(0, 0, NT_SIZE, NT_SIZE);
		glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

		glUseProgram(shader);
		labhelper::setUniformSlow(shader, "layer", i);
		labhelper::setUniformSlow(shader, "size", NT_SIZE);
		labhelper::drawFullScreenQuad();
	}

	glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void NoiseGenerator::debugDraw(float layer, float screenRatio, int channel) {

	glActiveTexture(GL_TEXTURE9);
	glBindTexture(GL_TEXTURE_3D, noiseTexture);
	glActiveTexture(GL_TEXTURE0);
	glUseProgram(debugShader);
	labhelper::setUniformSlow(debugShader, "layer", layer);
	labhelper::setUniformSlow(debugShader, "screenRatio", screenRatio);
	labhelper::setUniformSlow(debugShader, "channel", channel);
	labhelper::drawFullScreenQuad();
}