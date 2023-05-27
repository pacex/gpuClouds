

#ifdef _WIN32
extern "C" _declspec(dllexport) unsigned int NvOptimusEnablement = 0x00000001;
#endif

#include <GL/glew.h>
#include <cmath>
#include <cstdlib>
#include <algorithm>
#include <chrono>

#include <labhelper.h>
#include <imgui.h>
#include <imgui_impl_sdl_gl3.h>

#include <glm/glm.hpp>
#include <glm/gtx/transform.hpp>
using namespace glm;

#include <Model.h>
#include "hdr.h"
#include "fbo.h"

#include "noiseGenerator.h"




using std::min;
using std::max;

///////////////////////////////////////////////////////////////////////////////
// Various globals
///////////////////////////////////////////////////////////////////////////////
SDL_Window* g_window = nullptr;
float currentTime = 0.0f;
float previousTime = 0.0f;
float deltaTime = 0.0f;
bool showUI = false;
int windowWidth, windowHeight;

// Mouse input
ivec2 g_prevMouseCoords = { -1, -1 };
bool g_isMouseDragging = false;

// Screen Buffer
unsigned int screenbuffer;
unsigned int screenColorTexture;
unsigned int screenDepthTexture;

// Shadow map buffer
unsigned int shadowMapBuffer;
unsigned int shadowMapDepthTexture;
int shadowMapSize = 1024;

///////////////////////////////////////////////////////////////////////////////
// Shader programs
///////////////////////////////////////////////////////////////////////////////
GLuint shaderProgram;       // Shader for rendering geometry
GLuint simpleProgram;
GLuint backgroundProgram;	// Shader for rendering environment map as background
GLuint cloudProgram;		// Shader for rendering cloud container
GLuint cloudInsideProgram;	// Shader for rendering clouds if camera is inside cloud container
GLuint screenProgram;		// Shader for rendering screen buffer to screen

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
float environment_multiplier = 1.5f;
GLuint environmentMap, irradianceMap, reflectionMap;
const std::string envmap_base_name = "001";

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////

// TODO: change to directional light source

vec3 lightDirection;
vec3 lightColor = vec3(0.984f, 0.871f, 0.698f);

float light_intensity_multiplier = 1.0f;


vec3 skyColor = vec3(0.44f, 0.55f, 0.71f);
vec3 horizonColor = vec3(0.83f, 0.86f, 0.87f);




///////////////////////////////////////////////////////////////////////////////
// Camera parameters.
///////////////////////////////////////////////////////////////////////////////
vec3 cameraPosition(-70.0f, 50.0f, 70.0f);
vec3 cameraDirection = normalize(vec3(0.0f) - cameraPosition);
float cameraSpeed = 10.f;

vec3 worldUp(0.0f, 1.0f, 0.0f);

///////////////////////////////////////////////////////////////////////////////
// Models
///////////////////////////////////////////////////////////////////////////////
labhelper::Model* fighterModel = nullptr;
labhelper::Model* landingpadModel = nullptr;
labhelper::Model* cloudContainer = nullptr;

mat4 roomModelMatrix;
mat4 landingPadModelMatrix;
mat4 fighterModelMatrix;
mat4 cloudContainerModelMatrix;

mat4 lightViewMatrix;
mat4 lightProjMatrix;

float shipSpeed = 50;

///////////////////////////////////////////////////////////////////////
// Cloud Rendering
///////////////////////////////////////////////////////////////////////
NoiseGenerator* noiseGen = nullptr;
float previewLayer = 0.0;
bool displayPreview = false;
int previewChannel = 0;

float densityThreshold = 0.656f;
float densityMultiplier = 1.0f;
float lightAbsorption = 1.6f;
float lightAbsorptionSun = 0.666f;
float darknessThreshold = 0.267f;
float stepSize = 4.0f;
float stepSizeSun = 16.0f;
float cloudScale = 0.0022f;
float cloudSpeed = 10.0f;
float forwardScattering = 0.738f;

void loadShaders(bool is_reload)
{
	GLuint shader = labhelper::loadShaderProgram("../project/fullscreenQuad.vert", "../project/background.frag", is_reload);
	if(shader != 0)
	{
		backgroundProgram = shader;
	}

	shader = labhelper::loadShaderProgram("../project/simple.vert", "../project/simple.frag", is_reload);
	if (shader != 0)
	{
		simpleProgram = shader;
	}

	shader = labhelper::loadShaderProgram("../project/shading.vert", "../project/shading.frag", is_reload);
	if(shader != 0)
	{
		shaderProgram = shader;
	}

	shader = labhelper::loadShaderProgram("../project/cloud.vert", "../project/cloud.frag", is_reload);
	if (shader != 0)
	{
		cloudProgram = shader;
	}

	shader = labhelper::loadShaderProgram("../project/cloudInside.vert", "../project/cloud.frag", is_reload);
	if (shader != 0)
	{
		cloudInsideProgram = shader;
	}

	shader = labhelper::loadShaderProgram("../project/fullScreenQuad.vert", "../project/screen.frag", is_reload);
	if (shader != 0)
	{
		screenProgram = shader;
	}
}



///////////////////////////////////////////////////////////////////////////////
/// This function is called once at the start of the program and never again
///////////////////////////////////////////////////////////////////////////////
void initialize()
{
	ENSURE_INITIALIZE_ONLY_ONCE();

	///////////////////////////////////////////////////////////////////////
	//		Load Shaders
	///////////////////////////////////////////////////////////////////////
	loadShaders(false);

	///////////////////////////////////////////////////////////////////////
	//		Screen Buffer
	///////////////////////////////////////////////////////////////////////
	int w, h;
	SDL_GetWindowSize(g_window, &w, &h);
	if (w != windowWidth || h != windowHeight)
	{
		windowWidth = w;
		windowHeight = h;
	}
	
	
	glGenTextures(1, &screenColorTexture);
	glBindTexture(GL_TEXTURE_2D, screenColorTexture);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, windowWidth, windowHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

	glGenTextures(1, &screenDepthTexture);
	glBindTexture(GL_TEXTURE_2D, screenDepthTexture);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT, windowWidth, windowHeight, 0, GL_DEPTH_COMPONENT, GL_UNSIGNED_BYTE, nullptr);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

	glBindTexture(GL_TEXTURE_2D, 0);
	
	glGenFramebuffers(1, &screenbuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, screenbuffer);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, screenColorTexture, 0);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, screenDepthTexture, 0);
	glBindFramebuffer(GL_FRAMEBUFFER, 0);

	///////////////////////////////////////////////////////////////////////
	//		Shadow Map
	///////////////////////////////////////////////////////////////////////

	glGenTextures(1, &shadowMapDepthTexture);
	glBindTexture(GL_TEXTURE_2D, shadowMapDepthTexture);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT, shadowMapSize, shadowMapSize, 0, GL_DEPTH_COMPONENT , GL_UNSIGNED_BYTE, nullptr);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
	glBindTexture(GL_TEXTURE_2D, 0);

	glGenFramebuffers(1, &shadowMapBuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, shadowMapBuffer);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, shadowMapDepthTexture, 0);
	glBindFramebuffer(GL_FRAMEBUFFER, 0);

	///////////////////////////////////////////////////////////////////////
	// Load models and set up model matrices
	///////////////////////////////////////////////////////////////////////
	fighterModel = labhelper::loadModelFromOBJ("../scenes/space-ship.obj");
	landingpadModel = labhelper::loadModelFromOBJ("../scenes/city.obj");
	cloudContainer = labhelper::loadModelFromOBJ("../scenes/cube.obj");

	roomModelMatrix = mat4(1.0f);
	fighterModelMatrix = translate(15.0f * worldUp);
	landingPadModelMatrix = scale(vec3(2.6f));
	cloudContainerModelMatrix = translate(96.0f * worldUp) * scale(vec3(512.0f, 16.0f, 512.0f));

	lightDirection = normalize(vec3(1.0f, 0.15f, 1.0f));

	lightViewMatrix = lookAt(lightDirection, vec3(0.0f), worldUp);
	float smHalf = (float)shadowMapSize * 0.5f;
	lightProjMatrix = ortho(-smHalf, smHalf, -smHalf * 0.4f, smHalf * 0.4f, -1024.0f, 1024.0f);

	///////////////////////////////////////////////////////////////////////
	// Load environment map
	///////////////////////////////////////////////////////////////////////
	const int roughnesses = 8;
	std::vector<std::string> filenames;
	for(int i = 0; i < roughnesses; i++)
		filenames.push_back("../scenes/envmaps/" + envmap_base_name + "_dl_" + std::to_string(i) + ".hdr");

	environmentMap = labhelper::loadHdrTexture("../scenes/envmaps/" + envmap_base_name + ".hdr");
	irradianceMap = labhelper::loadHdrTexture("../scenes/envmaps/" + envmap_base_name + "_irradiance.hdr");
	reflectionMap = labhelper::loadHdrMipmapTexture(filenames);



	glEnable(GL_DEPTH_TEST); // enable Z-buffering
	glEnable(GL_CULL_FACE);  // enables backface culling
	
	///////////////////////////////////////////////////////////////////////
	// Cloud Rendering
	///////////////////////////////////////////////////////////////////////
	noiseGen = new NoiseGenerator();
	noiseGen->renderNoise();


}

void drawBackground(const mat4& viewMatrix, const mat4& projectionMatrix)
{
	glUseProgram(backgroundProgram);
	labhelper::setUniformSlow(backgroundProgram, "environment_multiplier", environment_multiplier);
	labhelper::setUniformSlow(backgroundProgram, "inv_PV", inverse(projectionMatrix * viewMatrix));
	labhelper::setUniformSlow(backgroundProgram, "camera_pos", cameraPosition);

	labhelper::setUniformSlow(backgroundProgram, "light_direction", lightDirection);
	labhelper::setUniformSlow(backgroundProgram, "color_sun", lightColor);
	labhelper::setUniformSlow(backgroundProgram, "color_sky", skyColor);
	labhelper::setUniformSlow(backgroundProgram, "color_horizon", horizonColor);
	labhelper::drawFullScreenQuad();
}

void drawScreenBuffer() {
	glUseProgram(screenProgram);
	labhelper::drawFullScreenQuad();
}


///////////////////////////////////////////////////////////////////////////////
/// This function is used to draw the main objects on the scene
///////////////////////////////////////////////////////////////////////////////
void drawScene(GLuint currentShaderProgram,
               const mat4& viewMatrix,
               const mat4& projectionMatrix)
{
	glUseProgram(currentShaderProgram);
	// Light source
	vec4 viewSpaceLightDirection = viewMatrix * vec4(lightDirection, 0.0f);
	labhelper::setUniformSlow(currentShaderProgram, "point_light_color", lightColor);
	labhelper::setUniformSlow(currentShaderProgram, "point_light_intensity_multiplier",
	                          light_intensity_multiplier);
	labhelper::setUniformSlow(currentShaderProgram, "viewSpaceLightDirection", vec3(viewSpaceLightDirection));
	//labhelper::setUniformSlow(currentShaderProgram, "viewSpaceLightDir",
	                          //normalize(vec3(viewMatrix * vec4(-lightDirection, 0.0f))));
	labhelper::setUniformSlow(currentShaderProgram, "light_pv", lightProjMatrix * lightViewMatrix);


	// Environment
	labhelper::setUniformSlow(currentShaderProgram, "environment_multiplier", environment_multiplier);

	// camera
	labhelper::setUniformSlow(currentShaderProgram, "viewInverse", inverse(viewMatrix));

	// landing pad
	labhelper::setUniformSlow(currentShaderProgram, "modelViewProjectionMatrix",
	                          projectionMatrix * viewMatrix * landingPadModelMatrix);
	labhelper::setUniformSlow(currentShaderProgram, "modelViewMatrix", viewMatrix * landingPadModelMatrix);
	labhelper::setUniformSlow(currentShaderProgram, "normalMatrix",
	                          inverse(transpose(viewMatrix * landingPadModelMatrix)));

	labhelper::render(landingpadModel);

	// Fighter
	labhelper::setUniformSlow(currentShaderProgram, "modelViewProjectionMatrix",
	                          projectionMatrix * viewMatrix * fighterModelMatrix);
	labhelper::setUniformSlow(currentShaderProgram, "modelViewMatrix", viewMatrix * fighterModelMatrix);
	labhelper::setUniformSlow(currentShaderProgram, "normalMatrix",
	                          inverse(transpose(viewMatrix * fighterModelMatrix)));

	labhelper::render(fighterModel);
}

void drawSceneToShadowMap()
{
	glUseProgram(simpleProgram);
	

	// Landing Pad
	labhelper::setUniformSlow(simpleProgram, "modelViewProjectionMatrix",
		lightProjMatrix * lightViewMatrix * landingPadModelMatrix);
	labhelper::render(landingpadModel);

	// Fighter
	labhelper::setUniformSlow(simpleProgram, "modelViewProjectionMatrix",
		lightProjMatrix * lightViewMatrix * fighterModelMatrix);
	
	labhelper::render(fighterModel);
}

void drawCloudContainer(const mat4& viewMatrix, const mat4& projectionMatrix) {

	GLuint shaderProgram;
	mat4 modelInverse = inverse(cloudContainerModelMatrix);
	vec3 camPosModel = vec3(modelInverse * vec4(cameraPosition, 1.0));

	bool cameraInVolume = camPosModel.x >= -1.0f && camPosModel.x <= 1.0f &&
							camPosModel.y >= -1.0f && camPosModel.y <= 1.0f &&
							camPosModel.z >= -1.0f && camPosModel.z <= 1.0f;

	cameraInVolume = false; // TODO: remove this once min ray cutoff works


	// Vertex shader uniforms
	if (cameraInVolume) {
		// Camera inside cloud volume
		shaderProgram = cloudInsideProgram;
		glUseProgram(shaderProgram);
		labhelper::setUniformSlow(shaderProgram, "inv_PVM", inverse(projectionMatrix * viewMatrix * cloudContainerModelMatrix));
	}
	else {
		// Camera outside cloud volume
		shaderProgram = cloudProgram;
		glUseProgram(shaderProgram);
		labhelper::setUniformSlow(shaderProgram, "modelViewProjectionMatrix", projectionMatrix * viewMatrix * cloudContainerModelMatrix);
	}

	// Fragment shader uniforms
	labhelper::setUniformSlow(shaderProgram, "pv", projectionMatrix * viewMatrix);
	labhelper::setUniformSlow(shaderProgram, "proj_inverse", inverse(projectionMatrix));
	labhelper::setUniformSlow(shaderProgram, "view_inverse", inverse(viewMatrix));
	labhelper::setUniformSlow(shaderProgram, "view", viewMatrix);
	labhelper::setUniformSlow(shaderProgram, "model_inverse", inverse(cloudContainerModelMatrix));
	labhelper::setUniformSlow(shaderProgram, "model", cloudContainerModelMatrix);
	labhelper::setUniformSlow(shaderProgram, "light_pv", lightProjMatrix * lightViewMatrix);
	
	labhelper::setUniformSlow(shaderProgram, "light_direction", lightDirection);
	labhelper::setUniformSlow(shaderProgram, "light_color", lightColor);
	labhelper::setUniformSlow(shaderProgram, "density_threshold", densityThreshold);
	labhelper::setUniformSlow(shaderProgram, "density_multiplier", densityMultiplier);
	labhelper::setUniformSlow(shaderProgram, "light_absorption", lightAbsorption);
	labhelper::setUniformSlow(shaderProgram, "light_absorption_sun", lightAbsorptionSun);
	labhelper::setUniformSlow(shaderProgram, "darkness_threshold", darknessThreshold);
	labhelper::setUniformSlow(shaderProgram, "cloud_scale", cloudScale);
	labhelper::setUniformSlow(shaderProgram, "cloud_speed", cloudSpeed);
	labhelper::setUniformSlow(shaderProgram, "step_size_sun", stepSizeSun);
	labhelper::setUniformSlow(shaderProgram, "step_size", stepSize);
	labhelper::setUniformSlow(shaderProgram, "time", currentTime);
	labhelper::setUniformSlow(shaderProgram, "forward_scattering", forwardScattering);

	if (cameraInVolume) labhelper::drawFullScreenQuad();
	else labhelper::render(cloudContainer);
	
}


///////////////////////////////////////////////////////////////////////////////
/// This function will be called once per frame, so the code to set up
/// the scene for rendering should go here
///////////////////////////////////////////////////////////////////////////////
void display(void)
{
	///////////////////////////////////////////////////////////////////////////
	// Check if window size has changed and resize buffers as needed
	///////////////////////////////////////////////////////////////////////////
	{
		int w, h;
		SDL_GetWindowSize(g_window, &w, &h);
		if(w != windowWidth || h != windowHeight)
		{
			windowWidth = w;
			windowHeight = h;
		}
	}
	
	glBindTexture(GL_TEXTURE_2D, screenColorTexture);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, windowWidth, windowHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
	glBindTexture(GL_TEXTURE_2D, screenDepthTexture);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT, windowWidth, windowHeight, 0, GL_DEPTH_COMPONENT, GL_UNSIGNED_BYTE, nullptr);

	glBindTexture(GL_TEXTURE_2D, 0);
	


	///////////////////////////////////////////////////////////////////////////
	// setup matrices
	///////////////////////////////////////////////////////////////////////////
	mat4 projMatrix = perspective(radians(45.0f), float(windowWidth) / float(windowHeight), 5.0f, 4096.0f);
	mat4 viewMatrix = lookAt(cameraPosition, cameraPosition + cameraDirection, worldUp);

	/*
	vec4 lightStartPosition = vec4(40.0f, 40.0f, 0.0f, 1.0f);
	lightDirection = vec3(rotate(currentTime, worldUp) * lightStartPosition);
	mat4 lightViewMatrix = lookAt(lightDirection, vec3(0.0f), worldUp);
	mat4 lightProjMatrix = perspective(radians(45.0f), 1.0f, 25.0f, 100.0f);
	*/

	///////////////////////////////////////////////////////////////////////////
	// Bind the environment map(s) to unused texture units
	///////////////////////////////////////////////////////////////////////////
	glActiveTexture(GL_TEXTURE6);
	glBindTexture(GL_TEXTURE_2D, environmentMap);
	glActiveTexture(GL_TEXTURE7);
	glBindTexture(GL_TEXTURE_2D, irradianceMap);
	glActiveTexture(GL_TEXTURE8);
	glBindTexture(GL_TEXTURE_2D, reflectionMap);
	glActiveTexture(GL_TEXTURE0);

	///////////////////////////////////////////////////////////////////////////
	// Draw shadow map
	///////////////////////////////////////////////////////////////////////////
	glBindFramebuffer(GL_FRAMEBUFFER, shadowMapBuffer);

	glViewport(0, 0, windowWidth, windowHeight);
	glClearColor(0.2f, 0.2f, 0.8f, 1.0f);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

	drawSceneToShadowMap();

	glBindFramebuffer(GL_FRAMEBUFFER, 0);

	

	///////////////////////////////////////////////////////////////////////////
	// Draw scene to screen buffer
	///////////////////////////////////////////////////////////////////////////
	glBindFramebuffer(GL_FRAMEBUFFER, screenbuffer);

	glActiveTexture(GL_TEXTURE12);
	glBindTexture(GL_TEXTURE_2D, shadowMapDepthTexture);
	glActiveTexture(GL_TEXTURE0);

	glViewport(0, 0, windowWidth, windowHeight);
	glClearColor(0.2f, 0.2f, 0.8f, 1.0f);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

	drawBackground(viewMatrix, projMatrix);
	drawScene(shaderProgram, viewMatrix, projMatrix);

	glBindFramebuffer(GL_FRAMEBUFFER, 0);


	///////////////////////////////////////////////////////////////////////////
	// Draw screen buffer and render cloud container
	///////////////////////////////////////////////////////////////////////////
	glActiveTexture(GL_TEXTURE9);
	glBindTexture(GL_TEXTURE_3D, noiseGen->noiseTexture);
	glActiveTexture(GL_TEXTURE10);
	glBindTexture(GL_TEXTURE_2D, screenColorTexture);
	glActiveTexture(GL_TEXTURE11);
	glBindTexture(GL_TEXTURE_2D, screenDepthTexture);
	glActiveTexture(GL_TEXTURE0);

	glViewport(0, 0, windowWidth, windowHeight);
	glClearColor(0.2f, 0.2f, 0.8f, 1.0f);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

	drawScreenBuffer();
	
	drawCloudContainer(viewMatrix, projMatrix);

	if (displayPreview) {
		noiseGen->debugDraw(previewLayer, (float)windowWidth / (float)windowHeight, previewChannel);
	}


}


///////////////////////////////////////////////////////////////////////////////
/// This function is used to update the scene according to user input
///////////////////////////////////////////////////////////////////////////////
bool handleEvents(void)
{
	// Allow ImGui to capture events.
	ImGuiIO& io = ImGui::GetIO();

	// check events (keyboard among other)
	SDL_Event event;
	bool quitEvent = false;
	while(SDL_PollEvent(&event))
	{
		ImGui_ImplSdlGL3_ProcessEvent(&event);

		if(event.type == SDL_QUIT || (event.type == SDL_KEYUP && event.key.keysym.sym == SDLK_ESCAPE))
		{
			quitEvent = true;
		}
		else if(event.type == SDL_KEYUP && event.key.keysym.sym == SDLK_g)
		{
			showUI = !showUI;
		}
		else if(event.type == SDL_KEYUP && event.key.keysym.sym == SDLK_PRINTSCREEN)
		{
			labhelper::saveScreenshot();
		}
		if(event.type == SDL_MOUSEBUTTONDOWN && event.button.button == SDL_BUTTON_LEFT
		   && (!showUI || !io.WantCaptureMouse))
		{
			g_isMouseDragging = true;
			int x;
			int y;
			SDL_GetMouseState(&x, &y);
			g_prevMouseCoords.x = x;
			g_prevMouseCoords.y = y;
		}

		if(!(SDL_GetMouseState(NULL, NULL) & SDL_BUTTON(SDL_BUTTON_LEFT)))
		{
			g_isMouseDragging = false;
		}

		if(event.type == SDL_MOUSEMOTION && g_isMouseDragging && !io.WantCaptureMouse)
		{
			// More info at https://wiki.libsdl.org/SDL_MouseMotionEvent
			int delta_x = event.motion.x - g_prevMouseCoords.x;
			int delta_y = event.motion.y - g_prevMouseCoords.y;
			float rotationSpeed = 0.4f;
			mat4 yaw = rotate(rotationSpeed * deltaTime * -delta_x, worldUp);
			mat4 pitch = rotate(rotationSpeed * deltaTime * -delta_y,
			                    normalize(cross(cameraDirection, worldUp)));
			cameraDirection = vec3(pitch * yaw * vec4(cameraDirection, 0.0f));
			g_prevMouseCoords.x = event.motion.x;
			g_prevMouseCoords.y = event.motion.y;
		}
	}

	// check keyboard state (which keys are still pressed)
	const uint8_t* state = SDL_GetKeyboardState(nullptr);

	static bool was_shift_pressed = state[SDL_SCANCODE_LSHIFT];
	if(was_shift_pressed && !state[SDL_SCANCODE_LSHIFT])
	{
		cameraSpeed /= 5;
	}
	if(!was_shift_pressed && state[SDL_SCANCODE_LSHIFT])
	{
		cameraSpeed *= 5;
	}
	was_shift_pressed = state[SDL_SCANCODE_LSHIFT];


	vec3 cameraRight = cross(cameraDirection, worldUp);

	if(state[SDL_SCANCODE_W])
	{
		cameraPosition += cameraSpeed * deltaTime * cameraDirection;
	}
	if(state[SDL_SCANCODE_S])
	{
		cameraPosition -= cameraSpeed * deltaTime * cameraDirection;
	}
	if(state[SDL_SCANCODE_A])
	{
		cameraPosition -= cameraSpeed * deltaTime * cameraRight;
	}
	if(state[SDL_SCANCODE_D])
	{
		cameraPosition += cameraSpeed * deltaTime * cameraRight;
	}
	if(state[SDL_SCANCODE_Q])
	{
		cameraPosition -= cameraSpeed * deltaTime * worldUp;
	}
	if(state[SDL_SCANCODE_E])
	{
		cameraPosition += cameraSpeed * deltaTime * worldUp;
	}
	return quitEvent;
}


///////////////////////////////////////////////////////////////////////////////
/// This function is to hold the general GUI logic
///////////////////////////////////////////////////////////////////////////////
void gui()
{
	// ----------------- Set variables --------------------------
	ImGui::Text("Application average %.3f ms/frame (%.1f FPS)", 1000.0f / ImGui::GetIO().Framerate,
	            ImGui::GetIO().Framerate);
	// ----------------------------------------------------------

	// Cloud Rendering
	ImGui::TextColored(ImVec4(1, 1, 0, 1), "Cloud Rendering:");

	ImGui::SliderFloat("Density Threshold", &densityThreshold, 0.0, 1.0);
	ImGui::SliderFloat("Density Multiplier", &densityMultiplier, 0.0, 2.0);
	ImGui::SliderFloat("Step Size", &stepSize, 0.1, 32.0);
	ImGui::SliderFloat("Step Size Sun", &stepSizeSun, 4.0, 64.0);
	ImGui::SliderFloat("Cloud Scale", &cloudScale, 0.0001, 0.02);
	ImGui::SliderFloat("Cloud Speed", &cloudSpeed, 0.0, 80.0);
	ImGui::SliderFloat("Light Absorption", &lightAbsorption, 0.0, 2.0);
	ImGui::SliderFloat("Light Absorption Sun", &lightAbsorptionSun, 0.0, 2.0);
	ImGui::SliderFloat("Darkness Threshold", &darknessThreshold, 0.0, 1.0);
	ImGui::SliderFloat("Forward-Scattering", &forwardScattering, 0.0, 1.0);

	// Noise
	ImGui::TextColored(ImVec4(1, 1, 0, 1), "Noise Generation:");

	ImGui::Checkbox("Enable Preview", &displayPreview);
	ImGui::SliderFloat("Preview Z", &previewLayer, 0.0, 1.0);
	ImGui::SliderInt("Preview Channel", &previewChannel, 0, 3);

}

int main(int argc, char* argv[])
{
	g_window = labhelper::init_window_SDL("OpenGL Project");

	initialize();

	bool stopRendering = false;
	auto startTime = std::chrono::system_clock::now();

	while(!stopRendering)
	{
		//update currentTime
		std::chrono::duration<float> timeSinceStart = std::chrono::system_clock::now() - startTime;
		previousTime = currentTime;
		currentTime = timeSinceStart.count();
		deltaTime = currentTime - previousTime;

		// Inform imgui of new frame
		ImGui_ImplSdlGL3_NewFrame(g_window);

		// check events (keyboard among other)
		stopRendering = handleEvents();

		// render to window
		display();

		// Render overlay GUI.
		if(showUI)
		{
			gui();
		}

		// Render the GUI.
		ImGui::Render();

		// Swap front and back buffer. This frame will now been displayed.
		SDL_GL_SwapWindow(g_window);
	}
	// Free Models
	labhelper::freeModel(fighterModel);
	labhelper::freeModel(landingpadModel);

	// Shut down everything. This includes the window and all other subsystems.
	labhelper::shutDown(g_window);
	return 0;
}
