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

function print_test(event) {
    //console.log(event);
}

function half_stgc(x, px, sx) {
    // out is proportional to x and sx

    return (x - px)/sx;
    //return (x + px)*sx;
}

function trans(px, py, s) {
    pan_x = px;
    pan_y = py;
    scale_x = s;
    scale_y = s;
    redraw();
}

function test_stgc() {
    var test_in = [
        [ 0,    0,   1,  0],
        [ 50,   0,   1, 50],
        [256, 256,   2,  0],
        [384, 256,   2, 64],
    ];

    for (var i=0; i<test_in.length; i++) {
        var t = test_in[i];
        var res = half_stgc(t[0], t[1], t[2]);
        if (res != t[3]) {
            console.log("ISSUE WITH stgc");
            console.log("" + t + " gives " + res);
        }
    }

}

test_stgc();

function screen_to_grid_coords(pair) {
    // pan_x = 50 and scale_x = 0.5 and pair[0] = 50
    // return [0] = 50
    //
    // pan_x = 0 and scale_x = 1 and pair[0] = 0
    // return [0] = 0
    //
    // pan_x = 0 and scale_x = 1 and pair[0] = x
    // return [0] = x
    //
    // pan_x = 100 and scale_x = 1 and pair[0] = x
    // return [0] = x - 100
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
        pan_x += event.movementX;// * scale_x;
        pan_y += event.movementY;// * scale_y;
    }
    redraw();
}

function scale_up(event) {
    // Basically we need to change pan as well so that screen_to_grid_coords
    // Gives the same value before and after the scale
    var old_grid_coords = screen_to_grid_coords([event.layerX, event.layerY]);
    var scalingFactor = 1 + Math.abs(event.deltaY / 265.0);

    if (event.deltaY > 0) {
        scalingFactor = 1 / scalingFactor;
    }

    scale_x *= scalingFactor;
    scale_y = scale_x;

    /*
    var new_grid_coords = screen_to_grid_coords([event.layerX, event.layerY]);
    console.log("Diff: (" + (new_grid_coords[0] - old_grid_coords[0]) + ", " 
                          + (new_grid_coords[1] - old_grid_coords[1]) + ")");

    pan_x += new_grid_coords[0] - old_grid_coords[0];
    pan_y += new_grid_coords[1] - old_grid_coords[1];

    new_grid_coords = screen_to_grid_coords([event.layerX, event.layerY]);
    console.log("Diff: (" + (new_grid_coords[0] - old_grid_coords[0]) + ", " 
                          + (new_grid_coords[1] - old_grid_coords[1]) + ")");
    */

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
