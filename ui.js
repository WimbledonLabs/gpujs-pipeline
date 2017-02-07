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
// | Global Variables
// '===========================================================================

var canvas = document.getElementById("plan");
var context = canvas.getContext('2d');

var renderableObjects = [];

var pan_x = 0;
var pan_y = 0;

var scale_x = 1.0;
var scale_y = 1.0;

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
        // TODO should use e.movementX and movementY so have better behaviour
        // when going off-canvas
        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        g[0] += this.offsetX;
        g[1] += this.offsetY;

        this.draggedObj.update({x: g[0],
                                y: g[1]});

        redraw();
    }
}

DragMouseStateManager.addTraits(MouseStateManager);

function EdgePointStateManager(point, event) {
    console.log("Yay, we're using the edgepointstatemanager");
    this.draggedObj = point;
    this.offsetX = 0;
    this.offsetY = 0;

    this.firstPress = true;
}

EdgePointStateManager.addTraits(DragMouseStateManager.prototype, {
    mouseup: function(e) {
        var current = this.draggedObj.inputPin || this.draggedObj.outputPin;
        var dir = (this.draggedObj.inputPin) ? "out" : "in";

        console.log("Looking for pins going " + dir);

        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        for (var i=0; i<renderableObjects.length; i++) {
            var obj = renderableObjects[i];
            if (obj instanceof Node) {
                for (var j=0; j<obj.pins[dir].length; j++) {
                    var pin = obj.pins[dir][j];
                    if (pin !== current && pin.inBounds(g[0], g[1])) {
                        // Set the dir
                        if (this.draggedObj.inputPin) {
                            this.draggedObj.outputPin = pin;
                        } else {
                            this.draggedObj.inputPin = pin;
                        }
                        redraw();

                        console.log("Finished Edge");
                        this.useDefaultMouseState();
                        return;
                    }
                }
            }
        }

        // This allows for click-hold-drag-release or for click-release move click-release
        if (!this.firstPress) {
            console.log("Try better to click on an actual pin...");
            renderableObjects.remove(this.draggedObj);
            redraw();
            this.useDefaultMouseState();
        }
        this.firstPress = false;
    },
});

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
        for (var i=0; i<renderableObjects.length; i++) {
            var obj = renderableObjects[i];
            if (obj.isPressable && obj.isOver(grid_coord)) {
                mouseStateManager = renderableObjects[i].press(e);
                return;
            }
        }

        // Using default scene panning behaviour
        this.isMouseDown = true;
        console.log("Default mousedown");
    },
    mousemove: function(e) {
        // Adjust global canvas pan
        if (this.isMouseDown) {
            pan_x += e.movementX;
            pan_y += e.movementY;

            redraw();
        }
    },
    mouseup: function(e) {
        this.isMouseDown = false;
        console.log("Default mouseup");
    }
};

DefaultMouseStateManager.addTraits(MouseStateManager);

var defaultMouseStateManager = new DefaultMouseStateManager();
mouseStateManager = defaultMouseStateManager;


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
        return this.inBounds(pos[0], pos[1]);
    },

    press: function(e) {
        console.log("Adding edge");
        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        var inPin = (this.dir === "in") ? this : null;
        var outPin = (this.dir === "in") ? null : this;

        var edge = new Edge(outPin, inPin);
        edge.x = g[0];
        edge.y = g[1];

        renderableObjects.push(edge);

        event.preventDefault();
        redraw();
        return new EdgePointStateManager(edge, event);
    },

    inBounds: function(x, y) {
        // TODO not repeat code...
        console.log("Pin check bounds");
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
        ctx.fillStyle = "#333333";
        ctx.fillTri(this._x + this.node.x, this._y + this.node.y, this.PIN_SIZE, angle);
        ctx.stroke();
    }
}

NodePin.addTraits(Renderable, Pressable);

function Edge(outputPin, inputPin) {
    this.outputPin = outputPin;
    this.inputPin = inputPin;

    // This is kind of ugly. Basically we need a way to render the edge
    // before it has both points to snap to. So here we have a "floating"
    // vertex :(
    this.x = 0;
    this.y = 0;
}

Edge.prototype = {
    draw: function (in_ctx) {
        var vf = [this.x, this.y];
        var vi = vf;
        var vo = vf;

        if (this.outputPin) {
            vi = [this.outputPin.x,
                  this.outputPin.y];
        }

        if (this.inputPin) {
            vo = [this.inputPin.x,
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

/*

pinDesc is a list of POJO's like so:

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

//function NodePin(node, dir, label, type, offsetX, offsetY) {

    this.hitbox = new Hitbox(this.x, this.y, this.w, this.h);

    this.pins = {};
    this.pins["out"] = [];
    this.pins["in"] = [];

    var offsetX = {}
    offsetX["in"] = -Math.sqrt(3) * 8 / 3;
    offsetX["out"] = 128 + Math.sqrt(3) * 8 / 3;

    var offsetY = {}
    offsetY["in"] = 32;
    offsetY["out"] = 32;

    var thisNode = this;

    pinDesc.forEach(function(desc) {
        var pin = new NodePin(thisNode, desc.dir, desc.label, desc.type,
                              offsetX[desc.dir], offsetY[desc.dir]);
        offsetY[desc.dir] += 32;
        thisNode.pins[desc.dir].push(pin);
        renderableObjects.push(pin);
    });
}

Node.prototype = {
    draw: function (in_ctx) {
        in_ctx.fillStyle = "#a0a0a0";
        in_ctx.fillRoundRect(this.x, this.y, this.w, this.h, 16);
        in_ctx.stroke();

        //this.pins.forEach(function(dir) { this.pins[dir].forEach(function(pin) {pin.draw()}) } );
        // ^How about the following instead?

        // this.pins["in"].forEach(function(pin) {pin.draw(in_ctx)});
        // this.pins["out"].forEach(function(pin) {pin.draw(in_ctx)});
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
};

Node.addTraits(Renderable, Pressable);


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
    for (var i=0; i<renderableObjects.length; i++) {
        renderableObjects[i].draw(context);
    }

    // *cough* hack *cough* otherwise the last object being rendered will
    // have a transparent fill in some cases... this is a nigh-invisible tri
    context.fillTri(0,0,0.01,0);
}


// .==========================================================================.
// |==========================================================================|
// |==========================================================================|
// | Application Code                                                         |
// '=========================================================================='

function add_square(event) {
    var g = screen_to_grid_coords([event.layerX, event.layerY]);

    renderableObjects.push( (new Node(128, 256, node2Pins)).setPos(g) )

    event.preventDefault();
    redraw();
}

function add_edge(event) {
    console.log("Adding edge");
    var g = screen_to_grid_coords([event.layerX, event.layerY]);

    var edge = new Edge(new NodePin(tmp1, "out", "out", "", 128 + Math.sqrt(3)/2 * 16, 32), null);
    edge.x = g[0];
    edge.y = g[1];

    renderableObjects.push(edge);

    mouseStateManager = new EdgePointStateManager(edge, event);
    event.preventDefault();
    redraw();
}

// .===========================================================================
// | Application Variables
// '===========================================================================

var bg_loaded = false;


// .===========================================================================
// | Initialization
// '===========================================================================

var bg_tile = new Image();

bg_tile.onload = function () {
    bg_loaded = true;
    redraw();
};

bg_tile.src = "grid_bg.png";

canvas.addEventListener("mousedown", delegateToMouseStateManager, false);
window.addEventListener("mouseup", delegateToMouseStateManager, false);
window.addEventListener("mousemove", delegateToMouseStateManager, false);

canvas.addEventListener("mousewheel", scale_up, false);
canvas.addEventListener("contextmenu", add_square, false);

window.setInterval(function () {
    var style = window.getComputedStyle(canvas);
    var calcWidth = parseInt(style.width.substring(0, style.width.length-2))
    var calcHeight = parseInt(style.height.substring(0, style.height.length-2))

    var needs_redraw = calcWidth != canvas.width || calcHeight != canvas.height;

    if (needs_redraw) {
        console.log("Needs redraw");
        canvas.width = calcWidth;
        canvas.height = calcHeight;
        redraw();
    }
}, 500);

//    {dir:"in", label:"A", type:"[x,y,4]"},

var node1Pins = [
    {dir: "out", label:"src", type:"[x,y,4]"}
];

var node2Pins = [
    {dir: "in",  label:"A", type:"[x,y,4]"},
    {dir: "in",  label:"B", type:"[x,y,4]"},
    {dir: "out", label:"C", type:"[x,y,4]"}
];

var tmp1 = new Node(128, 256, node1Pins);
var tmp2 = new Node(128, 256, node2Pins);

tmp1.setPos([0, 0]);
tmp2.setPos([500, 100]);
//var tmp1 = (new Node(128, 256)).setPos([0, 0]);
//var tmp2 = (new Node(128, 256)).setPos([500, 100]);

//var tmp3 = new Edge(new NodePin(tmp1, "out", "out", "", 128 + Math.sqrt(3)/2 * 16, 32),
//                    new NodePin(tmp2, "in",  "A", "", -Math.sqrt(3)/2*16, 32));

var tmp3 = new Edge(tmp1.pins["out"][0],
                    tmp2.pins["in"][1]);

// function NodePin(node, dir, label, offsetX, offsetY) {

renderableObjects.push(tmp1);
renderableObjects.push(tmp2);
renderableObjects.push(tmp3);

