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

function pan_test(event) {
    if (isMouseDown) {
        pan_x += event.movementX / scale_x;
        pan_y += event.movementY / scale_y;
    }
    redraw();
}

function scale_up(event) {
    console.log(event.deltaY);
    if (event.deltaY < 1) {
        scale_x *= 1 + Math.abs(event.deltaY / 265.0);
        scale_y = scale_x;
    } else {
        scale_x /= 1 + Math.abs(event.deltaY / 265.0);
        scale_y = scale_x;
    }
    redraw();
}

canvas.addEventListener("mousedown", mousedown, false);
canvas.addEventListener("mouseup", mouseup, false);
window.addEventListener("mousemove", pan_test, false);
window.addEventListener("mousewheel", scale_up, false);

var bg_loaded = false;

var pan_x = 0;
var pan_y = 0;

var scale_x = 1.0;
var scale_y = 1.0;

var canvas_x = 0;
var canvas_y = 0;
var canvas_sx = 1;
var canvas_sy = 1;

function redraw() {
    if (bg_loaded) {
        ctx.scale(scale_x / canvas_sx, scale_y / canvas_sy);
        canvas_sx = scale_x;
        canvas_sy = scale_y;

        ctx.translate(pan_x - canvas_x, pan_y - canvas_y);
        canvas_x = pan_x;
        canvas_y = pan_y;

        var pattern = context.createPattern(bg_tile, 'repeat');

        context.rect(0, 0, canvas.width, canvas.height);
        context.fillStyle = pattern;
        context.fill();


        context.rect(50, 50, 100, 100);
        context.fillStyle = "#FF0000";
        context.fillRect(0, 0, 100, 100);

        //ctx.save();
        //ctx.translate(pan_x, pan_y);
        //ctx.drawImage(canvas, 0, 0);
        //ctx.restore();
    }
}

window.setInterval(function () {
    var style = window.getComputedStyle(canvas);
    var calcWidth = parseInt(style.width.substring(0, style.width.length-2))
    var calcHeight = parseInt(style.height.substring(0, style.height.length-2))

    var needs_redraw = calcWidth != canvas.width || calcHeight != canvas.height;

    if (needs_redraw) {
        canvas.width = calcWidth;
        canvas.height = calcHeight;
        redraw();
    }
}, 200);


<!-- background tiling code from http://www.html5canvastutorials.com/tutorials/html5-canvas-patterns-tutorial/ -->
var bg_tile = new Image();


bg_tile.onload = function () {
    bg_loaded = true;
    redraw();
};

bg_tile.src = "grid_bg.png";
