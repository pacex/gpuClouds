#include "noiseGenerator.h"
#include <GL/glew.h>
#include <iostream>
#include <labhelper.h>

NoiseGenerator::NoiseGenerator(){

	// Create 3D noise texture
	const int NT_SIZE = 64;
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
	unsigned int framebuffer;
	glGenFramebuffers(1, &framebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);

	for (int i = 0; i < 64; i++) {
		glFramebufferTexture3D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_3D, noiseTexture, 0, i);
		glViewport(0, 0, 64, 64);
		glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

		glUseProgram(shader);
		labhelper::setUniformSlow(shader, "layer", i);
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