#version 420

const float M_PI = 3.14159265359;

// Perlin noise cell corner indices
const int x0y0z0 = 0;
const int x0y0z1 = 1;
const int x0y1z0 = 2;
const int x0y1z1 = 3;
const int x1y0z0 = 4;
const int x1y0z1 = 5;
const int x1y1z0 = 6;
const int x1y1z1 = 7;

layout(location = 0) out vec4 fragmentColor;
in vec2 texCoord;

uniform int layer;	// current layer
uniform int size;	// noise texture size

// ========================
// === RANDOM FUNCTIONS ===
// ========================

uint hash( uint x ) {
    x += ( x << 10u );
    x ^= ( x >>  6u );
    x += ( x <<  3u );
    x ^= ( x >> 11u );
    x += ( x << 15u );
    return x;
}



// Compound versions of the hashing algorithm
uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }



// Construct a float with half-open range [0:1] using low 23 bits.
// All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
float floatConstruct( uint m ) {
    const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
    const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32

    m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
    m |= ieeeOne;                          // Add fractional part to 1.0

    float  f = uintBitsToFloat( m );       // Range [1:2]
    return f - 1.0;                        // Range [0:1]
}

// Pseudo-random value in half-open range [0:1].
float random( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
float random( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }



// ========================
// ===== WORLEY NOISE =====
// ========================

vec3 getCellPos(vec3 cell, int N){
	
	// Pretend that points repeat outside of unit cube to make texture tilable
	vec3 offset = floor(cell / N);
	vec3 cellWrapped = vec3(mod(cell.x, N), mod(cell.y, N), mod(cell.z, N));

	vec4 seedX = vec4(cellWrapped, N);
	vec4 seedY = vec4(cellWrapped + vec3(M_PI, 0.0, 0.0), N);
	vec4 seedZ = vec4(cellWrapped + vec3(0.0, M_PI, 0.0), N);
	return (vec3(random(seedX), random(seedY), random(seedZ)) + cellWrapped) / N + offset;
}

float worley(vec3 pos, int N){
	
	vec3 cell = floor(pos * N);

	int cx = int(cell.x);
	int cy = int(cell.y);
	int cz = int(cell.z);

	float minDist = 1.0;

	for(int x = cx-1; x <= cx+1; x++){
		for(int y = cy-1; y <= cy+1; y++){
			for(int z = cz-1; z <= cz+1; z++){
				minDist = min(minDist, length(getCellPos(vec3(x,y,z), N) - pos));
			}
		}
	}

	return 1.0 - (minDist * N);
}


// ========================
// ===== PERLIN NOISE =====
// ========================

float interp(float x){
	// Interpolation function within cells.
	//	Degree 5 polynomial ensures continuous 1st and 2nd derivative at cell corner points
	return pow(x, 3.0) * (6.0 * pow(x, 2.0) - 15.0 * x + 10.0);
}

float interpValues(float a, float b, float x){
	return a + interp(x) * (b - a);
}

vec3 getGradient(vec3 cell, int N){
	
	vec3 cellWrapped = vec3(mod(cell.x, N), mod(cell.y, N), mod(cell.z, N));

	vec4 seedX = vec4(cellWrapped, N * M_PI);
	vec4 seedY = vec4(cellWrapped + vec3(M_PI, 0.0, 0.0), N * M_PI);
	vec4 seedZ = vec4(cellWrapped + vec3(0.0, M_PI, 0.0), N * M_PI);

	vec3 rand = vec3(random(seedX), random(seedY), random(seedZ));

	return normalize(rand * 2.0 - 1.0); // Project to unit sphere
}

float perlin(vec3 pos, int N){
	
	vec3 gridPos = pos * N;
	vec3 cell = floor(gridPos);

	float[8] values;

	for(int x = 0; x <= 1; x++){
		for(int y = 0; y <= 1; y++){
			for(int z = 0; z <= 1; z++){
				vec3 cellCorner = vec3(cell.x + x, cell.y + y, cell.z + z);
				values[x*4 + y*2 + z] = dot(getGradient(cellCorner, N), gridPos - cellCorner);
			}
		}
	}

	// Interpolate
	vec3 posInCell = fract(gridPos);
	float x0y0 = interpValues(values[x0y0z0], values[x0y0z1], posInCell.z);
	float x0y1 = interpValues(values[x0y1z0], values[x0y1z1], posInCell.z);
	float x1y0 = interpValues(values[x1y0z0], values[x1y0z1], posInCell.z);
	float x1y1 = interpValues(values[x1y1z0], values[x1y1z1], posInCell.z);

	float x0 = interpValues(x0y0, x0y1, posInCell.y);
	float x1 = interpValues(x1y0, x1y1, posInCell.y);

	return interpValues(x0, x1, posInCell.x) * 0.5 + 0.5; // Remap to [0,1]
}

// ==============================
// === ASSEMBLE NOISE TEXTURE ===
// ==============================

void main()
{
	// Compute position in unit cube
	vec3 pos = vec3(fract(texCoord * 2.0), float(layer) / float(size));

	// Generate different noise frequencies
	float worleyLow = worley(pos, 8);

	float perlin = perlin(pos, 8);

	// Assemble noise channels
	fragmentColor = vec4(vec3(perlin), 1.0);
}