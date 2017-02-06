var canvas = document.getElementById("plan");
var context = canvas.getContext('2d');
var ctx = context;

var mouse_offset_x = 0;
var mouse_offset_y = 0;

var isMouseDown = false;
var isObjDragged = false;
var objDragged = null;

var dragObjOffsetX = 0;
var dragObjOffsetY = 0;

var renderableObjects = [];

/* We could have made a state machine for the mouse which nicely tucks away
 * transitioning between states and objects being dragged, etc. but
 * there's not much need...
function MouseState() {
    this.potentialStates = [
        "none",
        "drag_bg",
        "drag_obj"
    ];

    this.transition("none");
}

MouseState.prototype = {
    inValidState: function () {
        for (var i=0; i<this.potentialStates; i++) {
            if (this.state === this.potentialStates[i]) {
                return true;
            }
        }

        return false;
    },

    transition: function (newState) {
        switch (newState) {
            case "none":
                this.state = "none";
                this.stateObj = null;
                break;
            case "drag_bg":
                if (this.state == "none") {

                }
            default:
                console.log("Invalid state " + newState);
                break;
    }
}
*/

function Hitbox(x, y, w, h) {
    this.update(x, y, w, h);
}

Hitbox.prototype = {
    inBounds: function (x,y) {
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

function Node(x, y, w, h) {
    this.hitbox = new Hitbox(x, y, w, h);
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
}

Node.prototype = {
    draw: function (in_ctx) {
        in_ctx.fillStyle = "#a0a0a0";
        in_ctx.fillRoundRect(this.x, this.y, this.w, this.h, 16);
        in_ctx.stroke();
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

CanvasRenderingContext2D.prototype.fillTri = function (x, y, s) {
    var h = Math.sqrt(3)/2 * s;

    var v0 = [x - s/2, y + h/3];
    var v1 = [x + s/2, y + h/3];
    var v2 = [x      , y - 2*h/3];

    this.fillPoly([v0, v1, v2]);
    console.log("Created tri");
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
    isMouseDown = true;
    isObjDragged = false;

    var grid_coord = screen_to_grid_coords([event.layerX, event.layerY]);
    for (var i=0; i<renderableObjects.length; i++) {
        if (renderableObjects[i].hitbox.inBounds(grid_coord[0], grid_coord[1])) {
            isObjDragged = true;
            objDragged = renderableObjects[i];

            dragObjOffsetX = objDragged.x - grid_coord[0];
            dragObjOffsetY = objDragged.y - grid_coord[1];
        }
    }
}

function mouseup(event) {
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
    ]
}

function pan_test(event) {
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
    console.log("Add square");

    var g = screen_to_grid_coords([event.layerX, event.layerY]);
    squares.push();
    renderableObjects.push(new Node(g[0], g[1], 128, 256))

    event.preventDefault();
    redraw();
}

canvas.addEventListener("mousedown", mousedown, false);
window.addEventListener("mouseup", mouseup, false);
window.addEventListener("mousemove", pan_test, false);
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
    ctx.setTransform(scale_x, 0, 0, scale_y, pan_x, pan_y);

    if (bg_loaded) {
        var pattern = context.createPattern(bg_tile, 'repeat');

        // Print background
        context.rect(-pan_x/scale_x, -pan_y/scale_y, canvas.width / scale_x, canvas.height / scale_y);
        context.fillStyle = pattern;
        context.fill();
    }

    // Print rectangles
    for (var i=0; i<renderableObjects.length; i++) {
        renderableObjects[i].draw(ctx);
    }

    ctx.fillTri(200, 200, 32);
    ctx.stroke();
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

renderableObjects = [new Node(0, 0, 128, 256)];

var bg_tile = new Image();

bg_tile.onload = function () {
    bg_loaded = true;
    redraw();
};

bg_tile.src = "grid_bg.png";
