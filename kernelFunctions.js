/* Please see the documentation in ui.js for details on how these functions are
 * composed in the ui to create larger image processing pipelines.
 * */

var menuSeparator = "\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015";

/* functionList is used by the ui to populate the context-click menu. The first
 * item is the text that appears in the menu, and the second item is a function
 * which returns a node when called.
 */
var functionList = [
    // Source nodes
    ["Circle", nodeType(circle)],
    ["Rectangle", nodeType(box)],
    ["Linear Gradient", nodeType(grad)],
    ["Colour", nodeType(colour)],

    // Simple math operators
    [menuSeparator , null],
    ["Average", nodeType(avg)],
    ["Max", nodeType(maxk)],
    ["Min", nodeType(mink)],
    ["Add", nodeType(add)],
    ["Subtract", nodeType(sub)],
    ["Multiply", nodeType(mul)],
    ["Divide", nodeType(div)],
    ["Invert", nodeType(inv)],
    ["Identity", nodeType(ident)],

    // Special-purpose functions
    [menuSeparator , null],
    ["Threshold", nodeType(threshold)],
    ["Brightness", nodeType(brightness)],
    ["Gamma Encode", nodeType(gammaEncode)],
    ["Gamma Decode", nodeType(gammaDecode)],

    // Transformations
    [menuSeparator , null],
    ["Translate", nodeType(translatek)],
    ["Warp", nodeType(uvWarp)],
    ["Mask", nodeType(mask)],

    // General-purpose convolution matrix with various kernels
    [menuSeparator , null],
    ["Convolution", nodeType(conv)],
    ["Box Blur", getKernNode(
            [[1/9,  1/9, 1/9],
             [1/9,  1/9, 1/9],
             [1/9,  1/9, 1/9]]
    )],
    ["Edge Detect", getKernNode(
            [[0,  1, 0],
             [1, -4, 1],
             [0,  1, 0]]
    )],
    ["Sharpen", getKernNode(
            [[ 0, -1,  0],
             [-1,  5, -1],
             [ 0, -1,  0]]
    )],
    ["H Sobel Kernel", getKernNode([[ 1,  0, -1], [2,  0, -2], [0, 0, 0]])],
    ["V Sobel Kernel", getKernNode([[-1, -2, -1], [0,  0,  0], [1, 2, 1]])],

    // Real-valued output nodes
    [menuSeparator , null],
    ["Slider", getSliderNode],
    ["One", getScalarOneNode],
    ["Zero", getScalarZeroNode],
    ["Time", getTimeNode],
    ["Sine", getSineNode],
];

/* Returns a factory for nodes which perform the provided function
 *
 * Params:
 *   fn - the kernel function
 *   output - node factory
 */
function nodeType(fn) {
    var factory = function() {
        var pins = [{dir:"out", label:"Out", type:"[x,y,4]"}];
        for (var i=0; i<fn.length; i++) {
            pins.push({dir:"in", label:"In", type:"[x,y,4]"})
        }
        var node = new Node(64, 32 + 32 * Math.max(1, fn.length), pins);
        node.setPos([x||0, y||0]);
        node.label = fn.name;
        node.kern = {};
        node.kern["gpu"] = gpu.createKernel(fn)
            .mode("gpu")
            .dimensions([tex_w, tex_h, 3])
            .outputToTexture(true)
            .graphical(false);
        node.kern["cpu"] = gpu.createKernel(fn)
            .mode("cpu")
            .dimensions([tex_w, tex_h, 3])
            .outputToTexture(true)
            .graphical(false);
        return node;
    }

    return factory;
};


// .===========================================================================
// | Node Functions Interals
// '===========================================================================

/* Maps a colour channel to 1 if it is greater than a threshold, 0 otherwise
 *
 * Params:
 *   A - input texture
 *   val - the threshold value
 *   output - the thresholded texture
 *
 * Uses:
 *   - Various effects
 */
function threshold(A, val) {
    return Math.floor(1 + Math.sign(A[this.thread.z][this.thread.y][this.thread.x] - val)/2);
}

/* Convert texture from sRGB colour space to Linear colour space
 *
 * Params:
 *   A - input texture
 *   output - the texture, gamma decoded
 *
 * Uses:
 *   - Most image processing algorithms are designed to work in linear colour
 *     space, but images are typically in sRGB colour space. This function
 *     allows images to be decoded for use in typical image processing
 *     functions. Operations as simple as blending, gradients, and scaling
 *     will yield incorrect results if the input texture is not in the correct
 *     colour space
 */
function gammaDecode(A) {
    return Math.pow(A[this.thread.z][this.thread.y][this.thread.x], 1.0/2.2);
}

/* Convert texture from linear colour space to sRGB colour space
 *
 * Params:
 *   A - input texture
 *   output - the texture, gamma encoded
 *
 * Uses:
 *   - Most image processing algorithms are designed to work in linear colour
 *     space, but need to be displayed on sRGB monitors, so we need to encode
 *     them before displaying
 */
function gammaEncode(A) {
    return Math.pow(A[this.thread.z][this.thread.y][this.thread.x], 2.2);
}

/* Brightne/Darken a texture with a scalar
 *
 * Params:
 *   A - input texture
 *   val - brightness level, 0.5 is no change, 0 is all black, 1.0 is 2x as bright
 *   output - the modified texture
 *
 * Uses:
 *   - Faster than multiplying with greyscale colour, this is just a special case
 *   - Sometimes images just aren't bright enough...
 */
function brightness(A, val) {
    // Faster than a multiply with a colour. 160 fps for 4 in a row vs.
    // 90 fps with 4 in a row
    return val*2*A[this.thread.z][this.thread.y][this.thread.x];
}

/* Shift a texture a given amount. Textures wrap around.
 *
 * Params:
 *   A - input texture
 *   x - amount to shift in x, scalar input
 *   y - amount to shift in y, scalar input
 *   output - the shifted texture
 *
 * Uses:
 *   - Animating textures with varying scalars (such as sine)
 *   - Positioning textures on the output image
 */
function translatek(A, x, y) {
    var tx = (this.thread.x + x * this.dimensions.x) % this.dimensions.x;
    var ty = (this.thread.y + y * this.dimensions.y) % this.dimensions.y;
    return A[this.thread.z][Math.floor(ty)][Math.floor(tx)];
}

/* A general-purpose convolution filter which applies a 3x3 convolution matrix
 * across a texture. Each output pixel is produced by weighting the pixels from
 * the input texture using the weights defined in the convolution matrix.
 *
 * Params:
 *   A - input texture
 *   k - 3x3 convolution matrix
 *   output - a texture convolved with the provided matrix
 *
 * Uses:
 *   - Sharpen, blur, edge detect, emboss
 */
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

/* Averages the channel values of two textures
 *
 * Params:
 *   r - red channel value, scalar input
 *   g - green channel value, scalar input
 *   b - blue channel value, scalar input
 *   output - a solid colour texture with the provided r, g, b values
 *
 * Uses:
 *  - For blending with textures to shift their colour (using add/mul/mask)
 *  - For isolating channels using mask (ex. for a chromatic aberration effect)
 */
function colour(r, g, b) {
    if (this.thread.z == 0) {
        return r;
    } else if (this.thread.z == 1) {
        return g;
    } else {
        return b
    }
}

/* Using a uv texture map, maps the pixels of the output to pixels on the input
 * texture. The red and green values on the uv texture map output pixels to pixels on the
 * input texture.
 *
 * Params:
 *   A - input texture
 *   B - uv map (only the red and green channels)
 *   output - the average of A and B for each channel value for each pixel
 *            location
 *
 * Uses:
 *   - Can act as a generic transformation for scaling, translation, and
 *     rotation. If the same set of transformations must be done on multiple
 *     textures, the final transformation can be stored as a uv texture, and
 *     applied to all the other textures (which is faster)
 *   - UV textures which store distortions such as pinching, swirling, and
 *     barrel distortion can be used to apply these distortions without having
 *     to implement each distortion individually
 *   - A UV map can represent a 3D object which allows you to apply a texture to
 *     the 3D object (can be applied to arbitrarily complex objects)
 */
function uvWarp(A, UV) {
    var u = Math.floor(0.5 + UV[0][this.thread.y][this.thread.x] * this.dimensions.x);
    var v = Math.floor(0.5 + UV[1][this.thread.y][this.thread.x] * this.dimensions.y);

    return A[this.thread.z][v][u];
}

/* Averages the channel values of two textures
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   output - the average of A and B for each channel value for each pixel location
 *
 * Uses:
 *  - Faster than mask when you want an even weighting between 2 textures, this
 *    is just a special case
 */
function avg(A, B) {
    return (A[this.thread.z][this.thread.y][this.thread.x] +
            B[this.thread.z][this.thread.y][this.thread.x]) / 2;
}

/* Blends the channels of two textures, with the weighting defined in a third
 * mask texture.
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   mask - for a channel value c, the output is p = A + (1-c)*B
 *   output - the blending of the two textures
 */
function mask(A,B, mask) {
    var m = mask[this.thread.z][this.thread.y][this.thread.x];
    return (   m  * A[this.thread.z][this.thread.y][this.thread.x] +
            (1-m) * B[this.thread.z][this.thread.y][this.thread.x]);
}

/* Performs the subtraction operation on the channels of two textures
 *
 * Params:
 *   A - minuend texture
 *   B - subtrahend texture
 *   output - the difference of A and B for each channel value for each pixel
 *            location
 */
function sub(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] -
           B[this.thread.z][this.thread.y][this.thread.x];
}

/* Performs the division operation on the channels of two textures
 *
 * Params:
 *   A - dividend texture
 *   B - divisor texture
 *   output - the quotient of A and B for each channel value for each pixel location
 */
function div(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] /
           B[this.thread.z][this.thread.y][this.thread.x];
}

/* Performs the multiplication operation on the channels of two textures
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   output - the product of each channel value for each pixel location
 */
function mul(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] *
           B[this.thread.z][this.thread.y][this.thread.x];
}

/* Performs the sum operation on the channels of two textures
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   output - the sum of each channel value for each pixel location
 */
function add(A, B) {
    return A[this.thread.z][this.thread.y][this.thread.x] +
           B[this.thread.z][this.thread.y][this.thread.x];
}

/* Performs the maximum of the channels of two textures
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   output - the maximum of each channel value for each pixel location
 */
function maxk(A, B) {
    return Math.max(A[this.thread.z][this.thread.y][this.thread.x],
                    B[this.thread.z][this.thread.y][this.thread.x]);
}

/* Performs the minimum of the channels of two textures
 *
 * Params:
 *   A - input texture
 *   B - input texture
 *   output - the minimum of each channel value for each pixel location
 */
function mink(A, B) {
    return Math.min(A[this.thread.z][this.thread.y][this.thread.x],
                    B[this.thread.z][this.thread.y][this.thread.x]);
}

/* Identity node does nothing to transform it's input, it simply passes it
 * through. It is used for testing the overhead of nodes in the pipeline.
 *
 * Params:
 *   A - input texture
 *   output - outputs A
 *
 * Uses:
 *  - Mainly for testing node overhead
 *  - Also useful as a buffer. If a texture is used in multiple places, this
 *    makes it easier to change textures.
 */
function ident(A) {
    return A[this.thread.z][this.thread.y][this.thread.x];
}

/* Inverts each channel of the texture
 *
 * Params:
 *   A - input texture
 *   output - inverted texture
 *
 * Uses:
 *  - Cool effects
 */
function inv(A) {
    return 1 - A[this.thread.z][this.thread.y][this.thread.x];
}

/* Creates a horizontal gradient */
function grad() {
    return this.thread.x / this.dimensions.x;
}

/* Creates a radial gradient centred around the middle of the texture */
function circle() {
    var sx = (this.thread.x - this.dimensions.x/2) / (this.dimensions.x/2 - 40);
    var sy = (this.thread.y - this.dimensions.y/2) / (this.dimensions.y/2 - 40);
    var c = Math.min(1.0, Math.sqrt(sx*sx + sy*sy));
    return c;
}

/* Creates a white rectangle defined by the vertices (x0, y0), (x1, y1)
 *
 * Params:
 *   x0 - starting x
 *   x1 - ending x
 *   y0 - starting y
 *   y1 - ending y
 *   output - black texture with a white triangle
 */
function box(x0, x1, y0, y1) {
    return (1 + Math.sign(-x0 + this.thread.x/this.dimensions.x)) *
           (1 + Math.sign( x1 - this.thread.x/this.dimensions.x)) *
           (1 + Math.sign(-y0 + this.thread.y/this.dimensions.y)) *
           (1 + Math.sign( y1 - this.thread.y/this.dimensions.y));
}


// .===========================================================================
// | Real-Value Nodes
// '===========================================================================

/* Returns a factory which outputs the provided value
 *
 * Params:
 *   kern - the value returned by the node
 *
 * Uses:
 *   - Creating nodes for use with the convolution function, has all the same
 *     uses
 */
function getKernNode(kern) {
    var inner = function kernel() {
        var node = new Node(64, 64, [{dir:"out", label:"kern", type:"scalar"}]);
        node.label = "Kernel"
        node.img.src = "";

        node.compute = function() {
            return kern;
        };

        return node;
    }

    return inner;
}

/* Node factory which returns a node that outputs a scalar. The scaler value
 * equals sin(t)^2 where t is the time in seconds. */
function getSineNode() {
    var node = new Node(128, 64, [{dir:"out", label:"Sine", type:"scalar"}]);
    node.label = "Sine"
    node.type = "scalar";
    node.img.src = "";
    node.compute = function() {
        return Math.pow(Math.sin(Date.now() / 1000), 2);
    };

    return node;
}

/* Node factory which returns a node that outputs a scalar. The scaler value
 * equals t % 1 where t is the time in seconds */
function getTimeNode() {
    var node = new Node(128, 64, [{dir:"out", label:"Time (s) mod 1", type:"scalar"}]);
    node.label = "Time (s) mod 1";
    node.type = "scalar";
    node.img.src = "";
    node.compute = function() {
        return (Date.now() % 1000) / 1000;
    };

    return node;
}

/* Node factory which returns a node that outputs a scalar. The scaler value
 * equals 1
 *
 * Uses:
 *   - Sometimes you need EXACTLY one, which you can't get with a slider
 */
function getScalarOneNode() {
    var node = new Node(64, 64, [{dir:"out", label:"One", type:"scalar"}]);
    node.label = "One";
    node.type = "scalar";
    node.img.src = "";
    node.compute = function() {
        return 1;
    };

    return node;
}


/* Node factory which returns a node that outputs a scalar. The scaler value
 * equals 0
 *
 * Uses:
 *   - Sometimes you need EXACTLY zero, which you can't get with a slider
 */
function getScalarZeroNode() {
    var node = new Node(64, 64, [{dir:"out", label:"Zero", type:"scalar"}]);
    node.label = "Zero";
    node.type = "scalar";
    node.img.src = "";
    node.compute = function() {
        return 0;
    };

    return node;
}

/* Node factory which returns a node that outputs a scalar. The scaler value
 * is based on the last place on the node that the mouse hovered over. Values
 * are between 0 and 1
 *
 * Uses:
 *   - Getting arbitrary scalar values
 */
function getSliderNode() {
    var node = new Node(128, 64, [{dir:"out", label:"Slider", type:"scalar"}]);
    node.label = "Slider";
    node.type = "scalar";
    node.img.src = "";

    node.slider = {
        val: 0.1,

        getValue: function() {
            return this.val;
        }
    }

    node.compute = function() {
        return this.slider.getValue();
    };

    node.isOver = function(pos) {
        var ret = this.hitbox.inBounds(pos);
        if (ret) {
            var t = pos[0] - this.x;
            var ts = t / this.w
            this.slider.val = ts;
        }

        return ret;
    }

    node.draw = function(ctx) {
        Node.prototype.draw.call(this, ctx);
        ctx.fillStyle = "#666666";
        ctx.fillRoundRect(this.x + 7, this.y + this.h / 2, this.w - 14, 6, 3);
        ctx.fillStyle = "#aaaaaa";
        ctx.fillRoundRect(this.x + 8, this.y + this.h / 2 + 1,
                          this.slider.getValue() * (this.w - 16),
                          4, 2);
    }

    return node;
}
