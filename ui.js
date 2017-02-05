var canvas = document.getElementById("plan");
var context = canvas.getContext('2d');
var ctx = context;

var mouse_offset_x = 0;
var mouse_offset_y = 0;

var isMouseDown = false;

function mousedown(event) {
    isMouseDown = true;
    //scale_x += 0.2;
}

function mouseup(event) {
    isMouseDown = false;
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
        pan_x += event.movementX;
        pan_y += event.movementY;
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
    squares.push(screen_to_grid_coords([event.layerX, event.layerY]));
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
        context.rect(-pan_x, -pan_y, canvas.width / scale_x, canvas.height / scale_y);
        context.fillStyle = pattern;
        context.fill();
    }

    // Print rectangles
    for (var i=0; i<squares.length; i++) {
        context.fillStyle = "#FF0000";
        context.fillRect(squares[i][0], squares[i][1], 64, 64);
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


<!-- background tiling code from http://www.html5canvastutorials.com/tutorials/html5-canvas-patterns-tutorial/ -->
var bg_tile = new Image();


bg_tile.onload = function () {
    bg_loaded = true;
    redraw();
};

bg_tile.src = "grid_bg.png";
