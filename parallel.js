function print(s) {
    var debugDiv = document.getElementById("debug");
    debugDiv.innerHTML += s + "<br />";
    debugDiv.scrollTop = debugDiv.scrollHeight - debugDiv.clientHeight;

}

function copycanvas() {
//    scaled.drawImage(canvas, 0, 0, xsize, ysize,
//                             0, 0, canvas_width, canvas_height);
}

var flip = true;
var generation = 0;
function pingpong() {
    if (flip) {
        Y = ping(X);
        show(Y);
        flip = false;
    } else {
        X = pong(Y);
        show(X);
        flip = true;
    }

    generation += 1;
}

function test() {
    var sleepFor = 0;
    window.setInterval(pingpong, sleepFor);
}

var mode = "gpu";

// Input dimensions
var xsize = 256;
var ysize = 256;

// Output Dimensions
var canvas_width = 512;
var canvas_height = 512;

var gpu = new GPU();
var opt = {
        dimensions: [100]
};

/*
var myFunc = gpu.createKernel(function(x) {
    return this.dimensions.z;
}).mode(mode).dimensions([100]);

var render = gpu.createKernel(function() {
    var sx = (this.thread.x - 10) / 8;
    var sy = (this.thread.y - 10) / 8;
    var c = Math.sqrt(sx*sx + sy*sy);
    this.color(c, c, c, 1);
}).mode(mode).dimensions([20, 20]).width(512).height(512).graphical(true);
*/

function lifeStep(grid) {

    //return Math.max(1, grid[this.thread.y][this.thread.x]);

    if (this.thread.x < 0.5 || this.thread.x > this.dimensions.x - 1.5 ||
        this.thread.y < 0.5 || this.thread.y > this.dimensions.y - 1.5    ) {
        return 0;
    }

    var a = grid[this.thread.y-1][this.thread.x-1] +
                    grid[this.thread.y-1][this.thread.x+0] +
                            grid[this.thread.y-1][this.thread.x+1];

    var b = grid[this.thread.y-0][this.thread.x-1] + 
                    0 +
                            grid[this.thread.y-0][this.thread.x+1];

    var c = grid[this.thread.y+1][this.thread.x-1] +
                    grid[this.thread.y+1][this.thread.x+0] +
                            grid[this.thread.y+1][this.thread.x+1];

    var s = a + b + c;

    var ts = (s - 2.5 - 0.5*(1-grid[this.thread.y][this.thread.x]));
    var dts = 0.8*ts;

    return Math.floor(0.5 +Math.max(0, 1 - Math.abs(dts)))
    //return Math.floor(0.5 + Math.min(1, Math.abs(1/dts)));

    /*

    if (grid[this.thread.y][x] < 0.5 && s > 2.5 && s < 3.5) {
        return 1;
    } else if (grid[this.thread.y][x] > 0.5 && s > 1.5 && s < 3.5) {
        return 1;
    } else {
        return 0;
    }

    return 1; // There should be no reason to get here...
    // */
}

var pong = gpu.createKernel(lifeStep)
    .mode(mode)
    .dimensions([xsize, ysize])
    .graphical(false)
    .outputToTexture(true);

    //.floatOutput(false)
    //.floatTextures(false)
    //.outputToTexture(true);//.graphical(true);

var ping = gpu.createKernel(lifeStep)
    .mode(mode)
    .dimensions([xsize, ysize])
    .graphical(false)
    .outputToTexture(true);

    /*.mode(mode)
.dimensions([xsize, ysize])
    .floatOutput(false)
    .floatTextures(false)
    .outputToTexture(true);//.graphical(true);*/

var show = gpu.createKernel(function(grid) {
    var c = grid[this.thread.y][this.thread.x];
    this.color(c,c,c,1);
}).mode(mode).dimensions([xsize, ysize])
    .graphical(true);

var canvas = show.getCanvas();

//if (mode !== "cpu") {
    document.getElementsByTagName('body')[0].appendChild(canvas);
//}

    /*
var scaledNode = document.getElementById("scaled");
var scaled = scaledNode.getContext('2d');
scaled.imageSmoothingEnabled = false;
scaled.mozImageSmoothingEnabled = false;
scaled.webkitImageSmoothingEnabled = false;
scaled.msImageSmoothingEnabled = false;

scaledNode.width = canvas_width;
scaledNode.height = canvas_height;
*/

var r = [];

for (var y=0; y<ysize; y++) {
    //row = new Array(xsize);
    //row.fill(0);
    //r.push(row);
    var row = [];
    for (var x=0; x<xsize; x++) {
        row.push(Math.round(Math.random()));
    }
    r.push(row);
    r.push(new Float32Array(xsize));
}

r[24][25] = 1;
r[25][25] = 1;
r[25][26] = 1;
r[25][24] = 1;
r[26][24] = 1;


//if (mode !== "cpu") {
//    scaledNode.style.display = "none";
//}

//print("in");
//print(r);
//print("out");
//print(step(r));

var i = 0;
var X = r;
var Y;

//pingpong();
//show(pong(r));

//test();
//console.log("parallel loaded");

