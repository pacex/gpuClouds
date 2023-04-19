#version 420

const int N_CELLS = 8; // Change to cell count here requires change to cell count in CPU program

layout(location = 0) out vec4 fragmentColor;
in vec2 texCoord;

uniform int layer;	// current layer
uniform int size;	// noise texture size

uniform vec3[N_CELLS * N_CELLS * N_CELLS] scattered_points;

int getCellId(int x, int y, int z){
	return int(mod(x, N_CELLS)) * N_CELLS * N_CELLS + int(mod(y, N_CELLS)) * N_CELLS + int(mod(z, N_CELLS));
}

vec3 samplePoint(vec3 cell){

	vec3 offset = floor(cell / N_CELLS);
	return scattered_points[getCellId(int(cell.x), int(cell.y), int(cell.z))] + offset;
}

void main()
{
	vec3 pos = vec3(texCoord, float(layer) / float(size));
	vec3 cellCoord = floor(pos * N_CELLS);

	int cx = int(cellCoord.x);
	int cy = int(cellCoord.y);
	int cz = int(cellCoord.z);

	float minDist = 1.0;

	for(int x = cx-1; x <= cx+1; x++){
		for(int y = cy-1; y <= cy+1; y++){
			for(int z = cz-1; z <= cz+1; z++){
				minDist = min(minDist, length(samplePoint(vec3(x,y,z)) - pos));
			}
		}
	}

	//fragmentColor = vec4(pos, 1.0);
	fragmentColor = vec4(1.0 - vec3(minDist) * N_CELLS, 1.0);
}