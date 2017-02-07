Object.prototype.addTraits = function() {
    var base = this;
    var traits = {};

    for(var i=0; i<arguments.length; i++) {
        traits = Object.assign(traits, arguments[i]);
    }

    base.prototype = Object.assign(traits, base.prototype);
};

var canvas = document.getElementById("plan");
var context = canvas.getContext('2d');

var mouse_offset_x = 0;
var mouse_offset_y = 0;

var isMouseDown = false;
var isObjDragged = false;
var objDragged = null;

var dragObjOffsetX = 0;
var dragObjOffsetY = 0;

var renderableObjects = [];


// .===========================================================================
// | Mouse State Managers
// '===========================================================================

var mouseStateManager = null;

var MouseStateManager = {
    event: function(e) {
        switch (e.eventType) {
            // Maybe all these methods should be called onMouse*(e) ?
            case "mousedown":
                return this.mousedown(e);
            case "mouseup":
                return this.mouseup(e);
            case "mouseover":
                return this.mouseover(e);
            default:
                console.log("Unknown mouse event " + e.eventType);
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
        this.useDefaultMouseState();
    },
    mousemove: function(e) {
        var g = screen_to_grid_coords([e.layerX, e.layerY]);

        g[0] += this.offsetX;
        g[1] += this.offsetY;

        this.draggedObj.update({x: g[0],
                                y: g[1]});

        redraw();
    }
}

DragMouseStateManager.addTraits(MouseStateManager);

function DefaultMouseStateManager() {
    this.isMouseDown = true;
}

DefaultMouseStateManager.prototype = {
    mousedown: function(e) {
        var grid_coord = screen_to_grid_coords([e.layerX, e.layerY]);
        this.isMouseDown = true;

        // Try to find an object to take over the mouse interaction
        for (var i=0; i<renderableObjects.length; i++) {
            if (renderableObjects[i].isOver(grid_coord)) {
                mouseStateManager = renderableObjects[i].press();
                return;
            }
        }
    },
    mousemove: function(e) {
        // Adjust global canvas pan
        if (this.isMouseDown) {
            pan_x += event.movementX;
            pan_y += event.movementY;
        }
    },
    mouseup: function(e) {
        this.isMouseDown = false;
    }
};

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
    press: function() {
        // Should override in subclass
        return defaultMouseStateManager;
    }
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

function rotate(p, a) {
    return [ p[0]*Math.cos(a) - p[1]*Math.sin(a),
             p[0]*Math.sin(a) + p[1]*Math.cos(a) ];
}

function translate(p, x, y) {
    return [p[0] + x,
            p[1] + y];
}

function NodePin(node, direction, label, offsetX, offsetY) {
    this.label = label;
    this.node = node;
    this.direction = direction;

    this.x = offsetX;
    this.y = offsetY;
}

NodePin.prototype = {
    getX: function() {
        return this.node.x + this.x;
    },

    getY: function() {
        return this.node.y + this.y;
    },

    getPos: function() {
        return [this.getx(), this.getY()];
    }

}

function Edge(outputPin, inputPin) {
    this.outputPin = outputPin;
    this.inputPin =  inputPin;
}

Edge.prototype = {
    draw: function (in_ctx) {

        in_ctx.fillStyle = "rgba(0, 0, 0, 0)";
        in_ctx.beginPath();
        in_ctx.moveTo(this.outputPin.getX(),
                      this.outputPin.getY());
        //in_ctx.lineTo(this.inputPin.x,
        //              this.inputPin.y);
        in_ctx.bezierCurveTo(
                (this.inputPin.getX() + this.outputPin.getX())/2,
                this.outputPin.getY(),

                (this.inputPin.getX() + this.outputPin.getX())/2,
                this.inputPin.getY(),

                this.inputPin.getX(), this.inputPin.getY());

        //in_ctx.closePath();
        in_ctx.fill();
        in_ctx.stroke();

        //in_ctx.fillRoundRect(this.outputPin.x, this.outputPin.y,
        //        this.inputPin.x - this.outputPin.x,
        //        this.inputPin.y - this.outputPin.y, 0);
    }
}

function NodeMouseStateManager(node) {
    this.node = node;
}

NodeMouseStateManager.prototype = {
    event: function(e) {
        this.isMouseDown = true;
        this.isObjDragged = false;

        var grid_coord = screen_to_grid_coords([e.layerX, e.layerY]);
        for (var i=0; i<renderableObjects.length; i++) {
            if (renderableObjects[i].isOver(grid_coord)) {
                mouseStateManager = renderableObjects[i].press();
                return;
            }


            if (!renderableObjects[i].hitbox) {
                continue;
            }

            if (renderableObjects[i].hitbox.inBounds(grid_coord[0], grid_coord[1])) {
                isObjDragged = true;
                objDragged = renderableObjects[i];

                dragObjOffsetX = objDragged.x - grid_coord[0];
                dragObjOffsetY = objDragged.y - grid_coord[1];
            }
        }
    }

}

function Node(w, h) {
    this.x = 0;
    this.y = 0;
    this.w = w;
    this.h = h;

    this.hitbox = new Hitbox(this.x, this.y, this.w, this.h);
}

Node.prototype = {
    draw: function (in_ctx) {
        in_ctx.fillStyle = "#a0a0a0";
        in_ctx.fillRoundRect(this.x, this.y, this.w, this.h, 16);
        in_ctx.stroke();

        in_ctx.fillStyle = "#333333";
        in_ctx.fillTri(this.x, this.y + 32, 16, Math.PI / 6);
        in_ctx.stroke();
        in_ctx.fillTri(this.x + this.w, this.y + 32, 16, Math.PI / 2);
        in_ctx.stroke();
    },

    setPos: function (pos) {
        this.update({x: pos[0],
                     y: pos[1]});
        return this;
    },

    isOver: function(pos) {
        return this.hitbox.inBounds(pos);
    },

    press: function() {


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

//Node.prototype = Object.assign({}, Renderable, Pressable, Node.prototype);

Node.addTraits(Renderable, Pressable);

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

function mousedown(event) {
    if (mouseStateManager && mouseStateManager != defaultMouseStateManager) {
        if (mouseStateManager.event(event)) {
            return;
        }
    }

    isMouseDown = true;
    isObjDragged = false;

    var grid_coord = screen_to_grid_coords([event.layerX, event.layerY]);
    for (var i=0; i<renderableObjects.length; i++) {
        if (renderableObjects[i].isOver(grid_coord)) {
            mouseStateManager = renderableObjects[i].press();
            //return;
        }


        if (!renderableObjects[i].hitbox) {
            continue;
        }

        if (renderableObjects[i].hitbox.inBounds(grid_coord[0], grid_coord[1])) {
            isObjDragged = true;
            objDragged = renderableObjects[i];

            dragObjOffsetX = objDragged.x - grid_coord[0];
            dragObjOffsetY = objDragged.y - grid_coord[1];
        }
    }
}

function mouseup(event) {
    if (mouseStateManager && mouseStateManager != defaultMouseStateManager) {
        if (mouseStateManager.event(event)) {
            return;
        }
    }

    isMouseDown = false;
    isObjDragged = false;
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

function mousemove(event) {
    if (mouseStateManager && mouseStateManager != defaultMouseStateManager) {
        if (mouseStateManager.event(event)) {
            return;
        }
    }

    var mouse_coords_span = document.getElementById("mouse_coords");
    var grid_coords_span = document.getElementById("grid_coords");
    mouse_coords_span.innerHTML = "(" + (event.layerX) + ", " + (event.layerY) + ")";

    var grid_coords = screen_to_grid_coords([event.layerX, event.layerY]);
    grid_coords_span.innerHTML = "(" + (grid_coords[0]) + ", " + (grid_coords[1]) + ")";

    if (isMouseDown) {
        if (!isObjDragged) {
            pan_x += event.movementX;
            pan_y += event.movementY;
        } else {
            g = grid_coords;
            g[0] += dragObjOffsetX;
            g[1] += dragObjOffsetY;

            objDragged.update({x: g[0],
                               y: g[1]});
        }
    }

    redraw();
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

function add_square(event) {

    var g = screen_to_grid_coords([event.layerX, event.layerY]);
    squares.push();
    renderableObjects.push( (new Node(128, 256)).setPos(g) )

    event.preventDefault();
    redraw();
}

canvas.addEventListener("mousedown", mousedown, false);
window.addEventListener("mouseup", mouseup, false);
window.addEventListener("mousemove", mousemove, false);
canvas.addEventListener("mousewheel", scale_up, false);
canvas.addEventListener("contextmenu", add_square, false);

var bg_loaded = false;

var pan_x = 0;
var pan_y = 0;

var scale_x = 1.0;
var scale_y = 1.0;

var canvas_x = 0;
var canvas_y = 0;
var canvas_sx = 1;
var canvas_sy = 1;

var squares = [[0,0]];

function redraw() {
    /*
    ctx.scale(scale_x / canvas_sx, scale_y / canvas_sy);
    ctx.translate(pan_x - canvas_x, pan_y - canvas_y);

    canvas_x = pan_x;
    canvas_y = pan_y;

    canvas_sx = scale_x;
    canvas_sy = scale_y;
    */
    context.setTransform(scale_x, 0, 0, scale_y, pan_x, pan_y);

    if (bg_loaded) {
        var pattern = context.createPattern(bg_tile, 'repeat');

        // Print background
        context.rect(-pan_x/scale_x, -pan_y/scale_y, canvas.width / scale_x, canvas.height / scale_y);
        context.fillStyle = pattern;
        context.fill();
    }

    // Print rectangles
    for (var i=0; i<renderableObjects.length; i++) {
        renderableObjects[i].draw(context);
    }
}

window.setInterval(function () {
    var style = window.getComputedStyle(canvas);
    var calcWidth = parseInt(style.width.substring(0, style.width.length-2))
    var calcHeight = parseInt(style.height.substring(0, style.height.length-2))

    var needs_redraw = calcWidth != canvas.width || calcHeight != canvas.height;

    if (needs_redraw) {
        console.log("Needs redraw");
        canvas.width = calcWidth;
        canvas.height = calcHeight;
        canvas_x = 0;
        canvas_y = 0;
        canvas_sx = 1;
        canvas_sy = 1;
        redraw();
    }
}, 500);

var tmp1 = new Node(128, 256);
var tmp2 = new Node(128, 256);

tmp1.setPos([0, 0]);
tmp2.setPos([500, 100]);
//var tmp1 = (new Node(128, 256)).setPos([0, 0]);
//var tmp2 = (new Node(128, 256)).setPos([500, 100]);
var tmp3 = new Edge(new NodePin(tmp1, "out", "out", 137, 32),
                    new NodePin(tmp2, "in",  "A", -9, 32));

// function NodePin(node, direction, label, offsetX, offsetY) {

renderableObjects = [
//    tmp3,
    tmp1,
    tmp2,
];

var bg_tile = new Image();

bg_tile.onload = function () {
    bg_loaded = true;
    redraw();
};

bg_tile.src = "grid_bg.png";
