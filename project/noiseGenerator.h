#pragma once
#include <GL/glew.h>

class NoiseGenerator {

public:
	NoiseGenerator(void);
	void renderNoise();
	void debugDraw(float layer, float screenRatio);

	unsigned int noiseTexture;

private:
	GLuint shader;
	GLuint debugShader;
};