var functionList = [
    // Multi-channel source function nodes
    ["Circle", nodeType(circle)],
    ["Linear Gradient", nodeType(grad)],
    ["Colour", nodeType(colour)],

    // General purpose multi-channel tranformation nodes
    ["Convolution", nodeType(conv)],
    ["Average", nodeType(avg)],
    ["Mask", nodeType(mask)],
    ["Warp", nodeType(uvWarp)],
    ["Max", nodeType(maxk)],
    ["Min", nodeType(mink)],
    ["Add", nodeType(add)],
    ["Subtract", nodeType(sub)],
    ["Multiply", nodeType(mul)],
    ["Divide", nodeType(div)],
    ["Threshold", nodeType(threshold)],
    ["Brightness", nodeType(brightness)],
    ["Translate", nodeType(translatek)],

    ["Gamma Encode", nodeType(gammaEncode)],
    ["Gamma Decode", nodeType(gammaDecode)],
    ["", nodeType()],

    // Scalar nodes
    ["Kernel", getKernNode(
            [[1,  0, -1],
             [2,  0, -2],
             [1,  0, -1]]
    )],
    ["H Sobel Kernel", getKernNode([[ 1,  0, -1], [2,  0, -2], [0, 0, 0]])],
    ["V Sobel Kernel", getKernNode([[-1, -2, -1], [0,  0,  0], [1, 2, 1]])],
    ["Slider", getSliderNode],
    ["Time", getTimeNode],
];


// .===========================================================================
// | Node Functions Interals
// '===========================================================================

function threshold(A, val) {
    return Math.floor(1 + Math.sign(A[this.thread.z][this.thread.y][this.thread.x] - val)/2);
}

function gammaDecode(A) {
    return Math.pow(A[this.thread.z][this.thread.y][this.thread.x], 1.0/2.2);
}

function gammaEncode(A) {
    return Math.pow(A[this.thread.z][this.thread.y][this.thread.x], 2.2);
}

function brightness(A, val) {
    // Faster than a multiply with a colour. 160 fps for 4 in a row vs.
    // 90 fps with 4 in a row
    return val*2*A[this.thread.z][this.thread.y][this.thread.x];
}

function translatek(A, x, y) {
    var tx = (this.thread.x + x * this.dimensions.x) % this.dimensions.x;
    var ty = (this.thread.y + y * this.dimensions.y) % this.dimensions.y;
    return A[this.thread.z][Math.floor(ty)][Math.floor(tx)];
}

function conv(A, k) {
    if (this.thread.y > 0 && this.thread.y < this.dimensions.y - 2 &&
            this.thread.x > 0 && this.thread.x < this.dimensions.x - 2) {
        var sum = 0;

        for (var y=-1; y<2; y++) {
            for (var x=-1; x<2; x++) {
                sum += A[this.thread.z][this.thread.y + y][this.thread.x + x] *
                        k[1 + y][1 + x];
            }
        }

        return sum;
    } else {
        return A[this.thread.z][this.thread.y][this.thread.x];
    }
}

function colour(r, g, b) {
    if (this.thread.z == 0) {
        return r;
    } else if (this.thread.z == 1) {
        return g;
    } else {
        return b
    }
}

function uvWarp(A, UV) {
    var u = Math.floor(0.5 + UV[0][this.thread.y][this.thread.x] * this.dimensions.x);
    var v = Math.floor(0.5 + UV[1][this.thread.y][this.thread.x] * this.dimensions.y);

    return A[this.thread.z][v][u];
}

function avg(A, B) {
    return (A[this.thread.z][this.thread.y][this.thread.x] +
            B[this.thread.z][this.thread.y][this.thread.x]) / 2;
}

function mask(A,B, mask) {
    var m = mask[this.thread.z][this.thread.y][this.thread.x];
    return (   m  * A[this.thread.z][this.thread.y][this.thread.x] +
            (1-m) * B[this.thread.z][this.thread.y][this.thread.x]);
}

function sub(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] -
           B[this.thread.z][this.thread.y][this.thread.x];
}

function div(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] /
           B[this.thread.z][this.thread.y][this.thread.x];
}

function mul(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] +
           B[this.thread.z][this.thread.y][this.thread.x];
}

function add(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] +
           B[this.thread.z][this.thread.y][this.thread.x];
}

function maxk(A, B) {
    return Math.max(A[this.thread.z][this.thread.y][this.thread.x],
                    B[this.thread.z][this.thread.y][this.thread.x]);
}

function mink(A, B) {
    return Math.min(A[this.thread.z][this.thread.y][this.thread.x],
                    B[this.thread.z][this.thread.y][this.thread.x]);
}

function grad() {
    return this.thread.x / 400;
}

function circle() {
    var sx = (this.thread.x - 200) / 160;
    var sy = (this.thread.y - 200) / 160;
    var c = Math.min(1.0, Math.sqrt(sx*sx + sy*sy));
    return c;
}
