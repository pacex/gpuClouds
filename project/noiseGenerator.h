#pragma once
#include <GL/glew.h>

#include <glm/glm.hpp>
#include <glm/gtx/transform.hpp>
using namespace glm;

class NoiseGenerator {

public:
	NoiseGenerator(void);
	void renderNoise();
	void debugDraw(float layer, float screenRatio, int channel);

	unsigned int noiseTexture;

private:
	int NT_SIZE;

	GLuint shader;
	GLuint debugShader;
};