/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * Welcome to the source code for (mostly) the UI portion of this project!
 *
 * Some things to note:
 * - Trait-based inheritance is used for rendering, and managing mouse
 *   interaction for the editor
 * - This file is not heavily documented since the ui simple acts as a wrapper
 *   around functions, and is not a focus of the project
 * - The image processing pipeline starts from a root display node, which
 *   requests a value from its input. Connected nodes recursively get values
 *   from their inputs until there is a node which requires no inputs (a source
 *   node such as an image, radial gradient, etc). These values then propagate
 *   back, being transformed at each node depending on the node's function. Once
 *   it reaches the display node it is displayed on an output canvas.
 * - Each node has 2 gpu.js kernels, one for the cpu mode, and one for the gpu
 * - The pipeline cannot have cycles, and no cycle detection is done.
 *
 * - The variable "functionList" is populated by kernelFunctions.js and contains
 *   an array with tuples of (node name, node factory)
 *
 * - All textures dimensions are hard-coded
 * */



// .===========================================================================
// | Object Prototype Functions
// '===========================================================================

Object.prototype.fullAssign = function(target, ...sources) {
// Taken from:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
    sources.forEach(source => {
        let descriptors = Object.keys(source).reduce((descriptors, key) => {
            descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
            return descriptors;
        }, {});

        // by default, Object.assign copies enumerable Symbols too
        Object.getOwnPropertySymbols(source).forEach(sym => {
            let descriptor = Object.getOwnPropertyDescriptor(source, sym);
            if (descriptor.enumerable) {
                descriptors[sym] = descriptor;
            }
        });
        Object.defineProperties(target, descriptors);
    });
    return target;
};

Object.prototype.addTraits = function() {
    var base = this;
    var traits = {};

    for(var i=0; i<arguments.length; i++) {
        traits = Object.fullAssign(traits, arguments[i]);
    }

    base.prototype = Object.fullAssign(traits, base.prototype);
};

Array.prototype.remove = function(obj) {
    this.splice(this.indexOf(obj), 1);
};


// .===========================================================================
// | Canvas Prototype Functions
// '===========================================================================

CanvasRenderingContext2D.prototype.fillTri = function (x, y, s, a) {
    if (a === undefined) a = Math.PI / 6 * 3;

    var h = Math.sqrt(3)/2 * s;

    var v0 = [-s/2,   h/3];
    var v1 = [+s/2,   h/3];
    var v2 = [0,   -2*h/3];

    v0 = translate(rotate(v0, a), x, y);
    v1 = translate(rotate(v1, a), x, y);
    v2 = translate(rotate(v2, a), x, y);

    this.fillPoly([v0, v1, v2]);
}

CanvasRenderingContext2D.prototype.fillPoly = function (vertices) {
    if (vertices.length < 3) {
        throw "Must have at least 3 vertices";
    }

    this.moveTo(vertices[0], vertices[1]);
    this.beginPath();
    for (var i=0; i< vertices.length; i++) {
        this.lineTo(vertices[i][0], vertices[i][1]);
    }
    this.closePath();
    this.fill();
}

CanvasRenderingContext2D.prototype.fillRoundRect = function (x, y, w, h, r) {
    // Start at top left just below the curve
    this.moveTo(x, y - r);
    this.beginPath();
    this.lineTo(x, y + h - r);
    this.quadraticCurveTo(x,     y + h, 
                          x + r, y + h);

    this.lineTo(x + w - r, y + h);
    this.quadraticCurveTo(x + w, y + h,
                          x + w, y + h - r);

    this.lineTo(x + w, y + r);
    this.quadraticCurveTo(x + w,     y,
                          x + w - r, y);

    this.lineTo(x + r, y);
    this.quadraticCurveTo(x, y,
                          x, y + r);

    this.closePath();
    this.fill();

}


// .===========================================================================
// | Traits
// '===========================================================================

var Renderable = {
    get isRenderable() {
        return true;
    },
    draw: function(ctx) {
        // Should override in subclass
        ctx.fillStyle = "rgba(1.0, 0, 1.0, 1.0)";
        ctx.fillTri(0, 0, 16, 1.0);
    }
};

var Pressable = {
    get isPressable() {
        return true;
    },
    isOver: function(pos) {
        // Should override in subclass
        return false;
    },
    press: function(e) {
        // Should override in subclass
        return defaultMouseStateManager;
    }
};

var Pinnable = {
    get isPin() {
        return true;
    },
    get pinDirection() {
        return "neither";
    },
};


// .===========================================================================
// | Global Variables
// '===========================================================================

var canvas = document.getElementById("plan");
var context = canvas.getContext('2d');

var tex_w = 400;
var tex_h = 400;

var editorObjects = [];

var pan_x = 225;
var pan_y = 316;

var scale_x = 1.0;
var scale_y = 1.0;

var renderMode = "gpu";

var gpu = new GPU();

// .===========================================================================
// | Mouse State Managers
// '===========================================================================

var mouseStateManager = null;

var MouseStateManager = {
    event: function(e) {
        switch (e.type) {
            // Maybe all these methods should be called onMouse*(e) ?
            case "mousedown":
                return this.mousedown(e);
            case "mouseup":
                return this.mouseup(e);
            case "mousemove":
                return this.mousemove(e);
            default:
                console.log("Unknown mouse event " + e.type);
                console.log(e);
                return;
        }
    },
    mousedown: function(e) {console.log("mousedown not implemented")},
    mouseup:   function(e) {console.log("mouseup not implemented")},
    mousemove: function(e) {console.log("mousemove not implemented")},

    useDefaultMouseState: function(e) {
        mouseStateManager = defaultMouseStateManager;
    }
}

function DefaultMouseStateManager() {
    this.isMouseDown = false;
}

DefaultMouseStateManager.prototype = {
    mousedown: function(e) {
        if (e.button != 0) {
            // Ignore non-left clicks
            return;
        }

        var grid_coord = screen_to_grid_coords([e.layerX, e.layerY]);

        // Try to find an object to take over the mouse interaction
        for (var i=0; i<editorObjects.length; i++) {
            var obj = editorObjects[i];
            if (obj.isPressable && obj.isOver(grid_coord)) {
                mouseStateManager = editorObjects[i].press(e);
                return;
            }
        }

        // Using default scene panning behaviour
        this.isMouseDown = true;
    },
    mousemove: function(e) {
        var grid_coord = screen_to_grid_coords([e.layerX, e.layerY]);
        for (var i=0; i<editorObjects.length; i++) {
            var obj = editorObjects[i];
            if (obj.isPressable) {
                obj.isOver(grid_coord);
            }
        }

        // Adjust global canvas pan
        if (this.isMouseDown) {
            pan_x += e.movementX;
            pan_y += e.movementY;
        }

        redraw();
    },
    mouseup: function(e) {
        this.isMouseDown = false;
    }
};

DefaultMouseStateManager.addTraits(MouseStateManager);

var defaultMouseStateManager = new DefaultMouseStateManager();
mouseStateManager = defaultMouseStateManager;

function ContextMenuStateManager(event) {
    var g = screen_to_grid_coords([event.layerX, event.layerY]);
    this.x = g[0];
    this.y = g[1];
    this.w = 100;
    this.h = 8 + functionList.length * 16;
    editorObjects.push(this);

    this.mousePos = g;
    this.rMousePos = [0,0];
}

ContextMenuStateManager.prototype = {
    draw: function(ctx) {
        var list = functionList;

        var oldLineWidth = ctx.lineWidth;
        ctx.beginPath();
            ctx.strokeStyle = "#333333";
            ctx.lineWidth = 2;
            ctx.fillStyle = "#a0a0a0";
            ctx.rect(this.x, this.y, this.w, this.h);
            ctx.fill();
            ctx.stroke();
        ctx.closePath();

        ctx.fillStyle = "#000000";
        for (var i=0; i<list.length; i++) {
            if (this.rMousePos[1] < 18 + 16 * i &&
                    this.rMousePos[1] > 22 + 16 * (i-1) &&
                    this.rMousePos[0] > 5 &&
                    this.rMousePos[0] < this.w) {
                ctx.fillStyle = "#777777";
                ctx.fillRect(this.x + 5,   this.y + 22 + 16 * (i-1),
                             this.w - 2*5, 16 - 4);
                ctx.fillStyle = "#000000";
            } else {
                ctx.fillStyle = "#000000";
            }
            ctx.fillText(list[i][0], this.x + 8, this.y + 15 + 16 * i);
        }

        ctx.lineWidth = oldLineWidth;
    },

    mousemove: function(e) {
        var g = screen_to_grid_coords([e.layerX, e.layerY]);
        this.mousePos = g;
        this.rMousePos = [g[0] - this.x, g[1] - this.y];
        redraw();
    },

    mousedown: function(e) {
        var list = functionList;
        for (var i=0; i<list.length; i++) {
            if (this.rMousePos[1] < 18 + 16 * i &&
                    this.rMousePos[1] > 22 + 16 * (i-1) &&
                    this.rMousePos[0] > 5 &&
                    this.rMousePos[0] < this.w) {
                var node = list[i][1].call(undefined);
                node.setPos(this.mousePos);
                editorObjects.push(node);
            }
        }

        this.useDefaultMouseState(e);
        redraw();
    },

    useDefaultMouseState: function(e) {
        editorObjects.remove(this);
        MouseStateManager.useDefaultMouseState(e);
    }
}

ContextMenuStateManager.addTraits(MouseStateManager, Renderable);

function DragMouseStateManager(obj, event) {
    var g = screen_to_grid_coords([event.layerX, event.layerY]);

    this.draggedObj = obj;
    this.offsetX = obj.x - g[0];
    this.offsetY = obj.y - g[1];
}

DragMouseStateManager.prototype = {
    mousedown: function(e) {/* Mouse is down for this manager's entire lifetime */},
    mouseup: function(e) {
        if (e.button == 0) {
            this.useDefaultMouseState();
        }
    },
    mousemove: function(e) {
        // TODO should use e.movementX and movementY to have better behaviour
        // when going off-canvas
        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        // Hey! Let's copy the code from the default mouse movement code so that
        // this can highlight things too. I'm sure I won't have to refactor this
        // later ;)
        for (var i=0; i<editorObjects.length; i++) {
            var obj = editorObjects[i];
            if (obj.isPressable) {
                obj.isOver(g);
            }
        }


        g[0] += this.offsetX;
        g[1] += this.offsetY;

        this.draggedObj.update({x: g[0],
                                y: g[1]});

        redraw();
    }
}

DragMouseStateManager.addTraits(MouseStateManager);

function EdgePointStateManager(point, event) {
    this.draggedObj = point;
    this.offsetX = 0;
    this.offsetY = 0;

    this.firstPress = true;
}

EdgePointStateManager.addTraits(DragMouseStateManager.prototype, {
    mouseup: function(e) {
        var current = this.draggedObj.inputPin || this.draggedObj.outputPin;
        var dir = (this.draggedObj.inputPin) ? "out" : "in";

        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        for (var i=0; i<editorObjects.length; i++) {
            var obj = editorObjects[i];

            // TODO look for NodePins, rather than the Nodes that contain them
            if (obj instanceof NodePin) {
                var pin = obj;

                // TODO pressing on a node twice should remove all
                var samePin = pin === current;
                var inBounds = pin.inBounds(g[0], g[1]);
                var directionCorrect = pin.dir !== current.dir;
                var notSameParent = pin.node !== current.node;
                if (!samePin && inBounds && directionCorrect && notSameParent) {
                    this.draggedObj.connect(pin, current);
                    this.useDefaultMouseState();
                    redraw();
                    return;
                }

                else if (samePin && inBounds && !this.firstPress) {
                    if (pin.dir === "in" && pin.edge) {
                        pin.edge.removeEdge();
                    } else {
                        while (pin.edges.length > 0) {
                            pin.edges[0].removeEdge();
                        }
                    }
                    editorObjects.remove(this.draggedObj);
                    this.useDefaultMouseState();
                    redraw();
                    return;
                }

            }
        }

        // This allows for click-hold-drag-release or for click-release move click-release
        if (!this.firstPress) {
            console.log("Try better to click on an actual pin...");
            editorObjects.remove(this.draggedObj);
            this.useDefaultMouseState();
            redraw();
            return;
        }
        console.log("First press up");
        this.firstPress = false;
    },
});

// .===========================================================================
// | Helper Functions
// '===========================================================================

function getArrayDimensions(arr) {
    // We assume that it's a rectangular array
    var dim = [];
    dim.push(arr.length);

    if (arr.length > 0 && Array.isArray(arr[0])) {
        var inner_dim = getArrayDimensions(arr[0]);
        dim = dim.concat(inner_dim);
    }

    return dim;
}

function getType(obj) {
    var name = typeof obj;

    // Just return the primitive type
    if (name != "object" && name != "function") {
        return name;
    }

    // Now we need to determine what kind of complex type we have
    if (obj === null) {
        return "null";
    } else if (Array.isArray(obj)) {
        return "[" + getArrayDimensions(obj) + "]";
    } else if (name === "function") {
        // We'll do more with this later
        return "function";
    } else if (name === "object") {
        // Here we have objects which are non-null
        // Later we'll check for specific types
        return "object";
    }

    throw "Could not determine type of " + name;
}

/** Rotate the point p around the origin
 */
function rotate(p, a) {
    return [ p[0]*Math.cos(a) - p[1]*Math.sin(a),
             p[0]*Math.sin(a) + p[1]*Math.cos(a) ];
}

/** Element-wise add x and y to p
 */
function translate(p, x, y) {
    return [p[0] + x,
            p[1] + y];
}

function half_stgc(x, px, sx) {
    return (x - px)/sx;
}

function screen_to_grid_coords(pair) {
    return [
        half_stgc(pair[0], pan_x, scale_x),
        half_stgc(pair[1], pan_y, scale_y),
    ];
}


// .===========================================================================
// | Canvas Objects
// '===========================================================================

function Hitbox(x, y, w, h) {
    this.update(x, y, w, h);
}

Hitbox.prototype = {
    inBounds: function (x,y) {
        if (y === undefined) {
            y = x[1];
            x = x[0];
        }

        return x >= this.x          && y >= this.y &&
               x <= this.x + this.w && y <= this.y + this.h;
    },

    update: function (x_or_obj, y, w, h) {
        if (typeof x_or_obj === "number") {
            this.x = x_or_obj;
            this.y = y;
            this.w = w;
            this.h = h;
        } else {
            var d = x_or_obj;

            if (d.x) {
                this.x = d.x;
            } if (d.y) {
                this.y = d.y;
            } if (d.w) {
                this.y = d.w;
            } if (d.h) {
                this.h = d.h;
            }
        }
    }
};

function NodePin(node, dir, label, type, offsetX, offsetY) {
    this.PIN_SIZE = 16.0;
    this.label = label;
    this.node = node;
    this.dir = dir;

    // 2017/02/07 19:32 SGT
    // Uhhh... this is the point where I reallized I probably should have used
    // the MVC pattern
    this.connectedPins = [];

    this._x = offsetX;
    this._y = offsetY;

    this.type = type;

    this.hovered = false;
    this.edges = [];
}

NodePin.prototype = {
    get x() {
        return this.node.x + this._x;
    },

    get y() {
        return this.node.y + this._y;
    },

    getPos: function() {
        return [this.x, this.y];
    },

    isOver: function(pos) {
        this.hovered = this.inBounds(pos[0], pos[1]);
        return this.hovered;
    },

    press: function(e) {
        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        var inPin = (this.dir === "in") ? this : null;
        var outPin = (this.dir === "in") ? null : this;

        var edge = new Edge(outPin, inPin);
        edge.x = g[0];
        edge.y = g[1];

        editorObjects.push(edge);

        e.preventDefault();
        redraw();
        return new EdgePointStateManager(edge, e);
    },

    inBounds: function(x, y) {
        // TODO not repeat code...
        var h = Math.sqrt(3)/2 * this.PIN_SIZE;

        // Sorry, it's easier to create branches than actually use the
        // angle to find a proper bounding box
        if (this.dir === "out") {
            return x >= this.x - h/3   && y >= this.y - this.PIN_SIZE / 2 &&
                   x <= this.x + 2*h/3 && y <= this.y + this.PIN_SIZE / 2;
        } else {
            return x >= this.x - 2*h/3   && y >= this.y - this.PIN_SIZE / 2 &&
                   x <= this.x + h/3 && y <= this.y + this.PIN_SIZE / 2;
        }
    },

    draw: function(ctx) {
        var angle = (this.dir === "in") ? Math.PI / 6 : Math.PI / 2;
        ctx.fillStyle = this.hovered ? "#AAA" : "#333333";
        ctx.strokeStyle = this.hovered ? "#FFA500" : "#333333";
        ctx.fillTri(this._x + this.node.x, this._y + this.node.y, this.PIN_SIZE, angle);
        ctx.stroke();
    }
}

NodePin.addTraits(Renderable, Pressable);

function Edge(outputPin, inputPin) {
    this.outputPin = outputPin;
    this.inputPin = inputPin;

    if (outputPin && inputPin) {
        this.connect(outputPin, inputPin);
    }

    // This is kind of ugly. Basically we need a way to render the edge
    // before it has both points to snap to. So here we have a "floating"
    // vertex :(
    this.x = 0;
    this.y = 0;
}

Edge.prototype = {
    removeEdge: function() {
        editorObjects.remove(this);
        if (this.inputPin) {
            this.inputPin.edge = undefined;
        } if (this.outputPin) {
            this.outputPin.edges.remove(this);
        }
    },

    connect: function(pin1, pin2) {
        var input;
        var output;
        if (pin1.dir === "in") {
            input = pin1;
            output = pin2;
        } else {
            output = pin1;
            input = pin2;
        }

        if (input.edge) {
            input.edge.removeEdge();
        }

        output.edges.push(this);
        input.edge = this;

        this.outputPin = output;
        this.inputPin = input;

        // Unneeded since we expect this to already be in the list
        // editorObjects.push(this);
    },

    draw: function (in_ctx) {
        var vf = [this.x, this.y];
        var vi = vf;
        var vo = vf;

        if (this.outputPin) {
            vi = [this.outputPin.x + 9,
                  this.outputPin.y];
        }

        if (this.inputPin) {
            vo = [this.inputPin.x - 9,
                  this.inputPin.y];
        }

        if (vi === vf && vo === vf) {
            // Somehow we don't have either of the vertices for the edge...
            console.log("Edge has no vertices");
        }

        in_ctx.fillStyle = "rgba(0, 0, 0, 0)";
        in_ctx.beginPath();
        in_ctx.moveTo(vo[0], vo[1]);

        in_ctx.bezierCurveTo(
                (vo[0] + vi[0])/2,
                vo[1],

                (vo[0] + vi[0])/2,
                vi[1],

                vi[0], vi[1]);

        in_ctx.fill();
        in_ctx.stroke();
    },

    update: function(x_or_obj, y) {
        if (typeof x_or_obj === "number") {
            this.x = x_or_obj;
            this.y = y;
        } else {
            var d = x_or_obj;

            if (d.x) {
                this.x = d.x;
            } if (d.y) {
                this.y = d.y;
            }
        }
    }
}

Edge.addTraits(Renderable);

// 2017/02/07 19:56 SGT
// How do I make the pipeline generic over array sizes :(

/*pinDesc is a list of POJO's like so:
[
    {dir:"in", label:"A", type:"[x,y,4]"},
    {dir:"in", label:"B", type:"[x,y,4]"},
    {dir:"out", label:"C", type:"[x,y,4]"},
]
*/

function Node(w, h, pinDesc) {
    this.x = 0;
    this.y = 0;
    this.w = w;
    this.h = h;

    this.label = "No Label Given";
    this.type = "default";

    this.hitbox = new Hitbox(this.x, this.y, this.w, this.h);

    this.img = new Image();
    this.img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAY" +
        "AAABzenr0AAAAPElEQVRYw+3VwQkAMRACQA3Xf8ubIvYRDsa/MODDJpksMrOq5+RxAAA" +
        "AAAAAAL7tn7c1AQAAAAAAwL8BF8kBBz58YT50AAAAAElFTkSuQmCC";

    this.pins = {};
    this.pins["out"] = [];
    this.pins["in"] = [];

    var offsetX = {}
    offsetX["in"] = -Math.sqrt(3) * 8 / 3;
    offsetX["out"] = this.w + Math.sqrt(3) * 8 / 3;

    var offsetY = {}
    offsetY["in"] = 32;
    offsetY["out"] = 32;

    var thisNode = this;

    pinDesc.forEach(function(desc) {
        var pin = new NodePin(thisNode, desc.dir, desc.label, desc.type,
                              offsetX[desc.dir], offsetY[desc.dir]);
        offsetY[desc.dir] += 32;
        thisNode.pins[desc.dir].push(pin);
        editorObjects.push(pin);
    });
}

Node.prototype = {
    draw: function (in_ctx) {
        in_ctx.strokeStyle = "#333333";
        switch (this.type) {
            case "scalar":
                in_ctx.fillStyle = "#a06000";
                break;

            default:
                in_ctx.fillStyle = "#a0a0a0";
                break;
        }
        in_ctx.fillRoundRect(this.x, this.y, this.w, this.h, 16);
        in_ctx.stroke();

        in_ctx.fillStyle = "#000000";
        in_ctx.fillText(this.label, this.x + 8, this.y + 15);

        var img_h = this.w - 24;
        var img_w = img_h;
        in_ctx.drawImage(this.img, this.x + 12,  this.y + this.h - img_h - 8,
                                   this.w - 24, img_h);
    },

    setPos: function (pos) {
        this.update({x: pos[0],
                     y: pos[1]});
        return this;
    },

    isOver: function(pos) {
        var res = this.hitbox.inBounds(pos);
        return res;
    },

    press: function(e) {
        return new DragMouseStateManager(this, e);
    },

    update: function (x_or_obj, y) {
        if (typeof x_or_obj === "number") {
            this.x = x_or_obj;
            this.y = y;

            this.hitbox.update({x: x_or_obj,
                                y: y});
        } else {
            var d = x_or_obj;

            if (d.x) {
                this.x = d.x;
            } if (d.y) {
                this.y = d.y;
            }

            this.hitbox.update(d);
        }
    },

    compute: function() {
        var params = [];
        for (var i=0; i<this.pins["in"].length; i++) {
            if (this.pins["in"][i].edge) {
                params.push(this.pins["in"][i].edge.outputPin.node.compute());
            } else {
                //console.log("Not all inputs are connected for " + this.label);
                return;
            }
        }

        var val = this.kern[renderMode].apply(undefined, params);
        return val;
    },
};

Node.addTraits(Renderable, Pressable);


function getNewDisplayNode() {
    var node = new Node(64, 64, [{dir:"in", label:"A", type:"[x,y,4]"}]);
    node.setPos([500, 100]);
    node.label = "Display";
    node.kern = {}
    node.kern["gpu"] = show["gpu"];
    node.kern["cpu"] = show["cpu"];
    node.img.src = "";
    return node;
}

function getImgNode(imgArr) {
    var node = new Node(64, 64, [{dir:"out", label:"img", type:"[x,y,4]"}]);
    node.setPos([300, 100]);
    node.label = "Image";

    // Cache the pixel array into a format usable by the current render mode
    // Will store the image as a texture for GPU mode
    var img = {};
    var rnd = Math.random();
    img["gpu"] = identity["gpu"](imgArr);
    img["cpu"] = identity["cpu"](imgArr);

    node.compute = function() {
        return img[renderMode];
    }
    return node;
}


// .===========================================================================
// | Application Mouse Events
// '===========================================================================

function delegateToMouseStateManager(event) {
    mouseStateManager.event(event);
}

function scale_up(event) {
    // Basically we need to change pan as well so that screen_to_grid_coords
    // Gives the same value before and after the scale
    var scalingFactor = 1 + Math.abs(event.deltaY / 265.0);

    if (event.deltaY > 0) {
        scalingFactor = 1 / scalingFactor;
    }

    scale_x *= scalingFactor;
    scale_y = scale_x;

    // The following 2 lines are so the mouse position with respect to it's
    // location on the grid remains constant while zooming
    //
    // Basically half_stgc should return the same value before and after
    // scaling, so we solve for the pan required to make it so
    pan_x = event.layerX - (event.layerX - pan_x)*scalingFactor;
    pan_y = event.layerY - (event.layerY - pan_y)*scalingFactor;

    redraw();
    event.preventDefault();
    return false;
}


// .===========================================================================
// | Canvas Drawing
// '===========================================================================

function redraw() {
    // Adjust the canvas window in the scene
    context.setTransform(scale_x, 0, 0, scale_y, pan_x, pan_y);

    // Draw background
    if (bg_loaded) {
        var pattern = context.createPattern(bg_tile, 'repeat');
        context.rect(-pan_x/scale_x, -pan_y/scale_y, canvas.width / scale_x, canvas.height / scale_y);
        context.fillStyle = pattern;
        context.fill();
    }

    // Draw objects
    for (var i=0; i<editorObjects.length; i++) {
        editorObjects[i].draw(context);
    }

    // *cough* hack *cough* otherwise the last object being rendered will
    // have a transparent fill in some cases... this is a nigh-invisible tri
    context.fillTri(0,0,0.01,0);
}


/* Taken from example code */
function loadImage(imageElement) {
    var imag = imageElement;
    var arr = [];
    //var canvas = document.getElementById("backimageCanvas");
    //var ctx = canvas.getContext('2d');
    //var imag = document.getElementById("backimage");
    var clipboardCtx = document.getElementById("clipboard").getContext('2d');
    clipboardCtx.drawImage(imag, 0, 0, tex_w, tex_h);

    // Why do this next line?
    imag.style.display = 'none';

    var imageData = clipboardCtx.getImageData(0, 0, tex_w, tex_h);

    for (var channel=0; channel<4; channel++) {
        arr.push([]);
        for (var y=0; y<tex_h; y++) {
            arr[channel].push([]);
        }
    }
    var pointer = 0;
    for (var y=0; y<tex_h; y++) {
        for (var x=0; x<tex_w; x++) {
            arr[0][tex_h-y-1][x] = imageData.data[pointer++]/256;
            arr[1][tex_h-y-1][x] = imageData.data[pointer++]/256;
            arr[2][tex_h-y-1][x] = imageData.data[pointer++]/256;
            arr[3][tex_h-y-1][x] = imageData.data[pointer++]/256;
        }
    }

    //return arr;
    editorObjects.push(getImgNode(arr));
}

function recomputeCanvasSize() {
    var style = window.getComputedStyle(canvas);
    // Grab actual dimensions from the computed style
    var calcWidth = parseInt(style.width.substring(0, style.width.length-2))
    var calcHeight = parseInt(style.height.substring(0, style.height.length-2))

    var needs_redraw = calcWidth != canvas.width || calcHeight != canvas.height;

    if (needs_redraw) {
        console.log("Needs redraw");
        canvas.width = calcWidth;
        canvas.height = calcHeight;
        redraw();
    }
}


// .==========================================================================.
// |==========================================================================|
// |==========================================================================|
// | Application Code                                                         |
// '=========================================================================='

function add_square(event) {
    var g = screen_to_grid_coords([event.layerX, event.layerY]);

    mouseStateManager = new ContextMenuStateManager(event);

    event.preventDefault();
    redraw();
}

function add_edge(event) {
    console.log("Adding edge");
    var g = screen_to_grid_coords([event.layerX, event.layerY]);

    var edge = new Edge(new NodePin(tmp1, "out", "out", "", 128 + Math.sqrt(3)/2 * 16, 32), null);
    edge.x = g[0];
    edge.y = g[1];

    editorObjects.push(edge);

    mouseStateManager = new EdgePointStateManager(edge, event);
    event.preventDefault();
    redraw();
}

function bgImgLoaded() {
    bg_loaded = true;
    redraw();
}

/* Method body from the following link:
 * http://stackoverflow.com/questions/10906734/how-to-upload-image-into-html5-canvas
 *
 * This is the standard way to read uploaded files.
 * */
function handleFiles(files) {
    var reader = new FileReader();
    reader.onload = function(event){
        var img = new Image();
        img.onload = function(){
            loadImage(img);
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(files[0]);
}

function computeThumbnails() {
    for (var i=0; i<editorObjects.length; i++) {
        var obj = editorObjects[i];
        if (!(obj instanceof Node) ||
                obj === displayNode ||
                obj.type == "scalar") {
            continue;
        }

        console.log("Computing thumbnail for " + obj.label + " type: " + obj.type);
        try {
            // Supress errors when a node doesn't have all inputs
            show[renderMode](obj.compute());
            obj.img.src = outputCanvas[renderMode].toDataURL();
        } catch (e) {}
    }
    redraw();
}

function toggleMode() {
    renderMode = (renderMode == "gpu") ? "cpu" : "gpu";
    console.log("Changing to   " + renderMode + " mode");
    var toggleButton = document.getElementById("toggleMode");
    toggleButton.value = renderMode + " Mode";
}

// .===========================================================================
// | Application Variables
// '===========================================================================

// Create the kernel which actually draws to the screen
// Defaults to gpu since that's what the example code has, and it makes it
// easier to switch between cpu and gpu
var show = {}

show["gpu"] = gpu.createKernel(function(A) {
    this.color(A[0][this.thread.y][this.thread.x],
               A[1][this.thread.y][this.thread.x],
               A[2][this.thread.y][this.thread.x]);
}).mode("gpu")
    .dimensions([tex_w, tex_h])
    .graphical(true);

show["cpu"] = gpu.createKernel(function(A) {
    this.color(A[0][this.thread.y][this.thread.x],
               A[1][this.thread.y][this.thread.x],
               A[2][this.thread.y][this.thread.x]);
}).mode("cpu")
    .dimensions([tex_w, tex_h])
    .graphical(true);


function ident(img) {
    return img[this.thread.z][this.thread.y][this.thread.x];
}

identity = {};
// The following two functions return a texture given an array input
identity["gpu"] = function(imgArr) {
    return gpu.createKernel(ident).mode("gpu")
              .dimensions([tex_w, tex_h, 3])
              .outputToTexture(true)
              .graphical(false)(imgArr);
}
identity["cpu"] = function(imgArr) {
    return gpu.createKernel(ident).mode("cpu")
              .dimensions([tex_w, tex_h, 3])
              .outputToTexture(true)
              .graphical(false)(imgArr);
}

var bg_loaded = false;
var bg_tile = new Image();
bg_tile.crossOrigin = 'anonymous';
bg_tile.onload = bgImgLoaded;
//bg_tile.src = "grid_bg.png";
bg_tile.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABz" +
"enr0AAAAQklEQVRYw+3VsQkAMQwDQCf8VJ7W03it/BAuQuDUCw5UaFXViUG6e1KPHZcDAAAAAAAA" +
"8E3/PDNNAAAAAAAA8DbgBz5jCHOrWGXXAAAAAElFTkSuQmCC";

var frameCount = 0;


// .===========================================================================
// | Initialization
// '===========================================================================

canvas.addEventListener("mousedown", delegateToMouseStateManager, false);
window.addEventListener("mouseup", delegateToMouseStateManager, false);
window.addEventListener("mousemove", delegateToMouseStateManager, false);

canvas.addEventListener("mousewheel", scale_up, false);
canvas.addEventListener("contextmenu", add_square, false);

var outputCanvas = {};
outputCanvas["gpu"] = show["gpu"].getCanvas();
outputCanvas["cpu"] = show["cpu"].getCanvas();
outputCanvas["gpu"].className = "ui gpu";
outputCanvas["cpu"].className = "ui cpu";

document.getElementsByTagName('body')[0].appendChild(outputCanvas["gpu"]);
document.getElementsByTagName('body')[0].appendChild(outputCanvas["cpu"]);

// Add the display node to the canvas, an image node is also added be default
// loadImage is called by the page body's onload property
var displayNode = getNewDisplayNode();
editorObjects.push(displayNode);

// showNewImage used to be declared using a variable, but the chrome
// profiler shows lower overhead when calling showNewImage when it's
// declared as a function as below
function showNewImage() {
    displayNode.compute();
    frameCount++;
}

var displayFps = function() {
    document.getElementById("fps").innerHTML = frameCount;
    frameCount = 0;
}

window.setInterval(showNewImage, 0);
window.setInterval(displayFps, 1000);
window.setInterval(recomputeCanvasSize, 500);

