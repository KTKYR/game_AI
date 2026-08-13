// ===============================
// 1. การตั้งค่า Teachable Machine
// ===============================
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/rAHIczfw0/";
const CONFIDENCE_LIMIT = 0.85;

let model, webcam, cameraCtx;
let currentPose = "none";
let isCameraReady = false;

// ตั้งค่าคลาสจาก Teachable Machine (ต้องพิมพ์ให้ตรงกับในเว็บเป๊ะๆ)
const poses = {
    LEFT_ARM: "ยืดแขนด้านซ้าย",
    RIGHT_ARM: "ยืดแขนด้านขวา",
    LEFT_NECK: "เอียงคอด้านซ้าย",
    RIGHT_NECK: "เอียงคอด้านขวา",
    CENTER_ARM: "ยืดแขนตรงๆ"
};

// ===============================
// 2. ตัวแปรระบบเกม
// ===============================
const gameCanvas = document.getElementById("gameCanvas");
const ctx = gameCanvas.getContext("2d");

let gameRunning = false;
let score = 0;
let startTime = 0;
let elapsedTime = 0;
let frameCount = 0;

const laneWidth = gameCanvas.width / 3;
const hitZoneY = 480;      
const hitZoneHeight = 80;  
let noteSpeed = 4;       

let activeNotes = [];

// ===============================
// 3. ฟังก์ชันเริ่มต้นและการทำงาน AI
// ===============================
async function init() {
    const startBtn = document.getElementById("startBtn");
    startBtn.disabled = true;
    startBtn.innerText = "กำลังโหลดโมเดล...";

    try {
        const modelURL = MODEL_URL + "model.json";
        const metadataURL = MODEL_URL + "metadata.json";
        model = await tmPose.load(modelURL, metadataURL);

        webcam = new tmPose.Webcam(300, 300, true);
        await webcam.setup();
        await webcam.play();

        const cameraCanvas = document.getElementById("cameraCanvas");
        cameraCtx = cameraCanvas.getContext("2d");
        document.getElementById("loadingText").classList.add("hidden");
        
        isCameraReady = true;
        window.requestAnimationFrame(predictLoop);
        
        startBtn.innerText = "กำลังเล่น...";
        document.getElementById("restartBtn").disabled = false;
        
        startGame();
    } catch (error) {
        alert("ไม่สามารถโหลดโมเดลได้ กรุณาตรวจสอบ MODEL_URL");
        console.error(error);
        startBtn.disabled = false;
        startBtn.innerText = "เริ่มเกม";
    }
}

async function predictLoop() {
    if (isCameraReady && gameRunning) {
        webcam.update();
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        const prediction = await model.predict(posenetOutput);

        let bestPred = prediction[0];
        for (let i = 1; i < prediction.length; i++) {
            if (prediction[i].probability > bestPred.probability) {
                bestPred = prediction[i];
            }
        }

        if (bestPred.probability > CONFIDENCE_LIMIT) {
            currentPose = bestPred.className; // ใช้ชื่อคลาสโดยตรง
        } else {
            currentPose = "none";
        }

        document.getElementById("poseDisplay").innerText = currentPose;
        drawCamera(pose);
    }
    
    // วนลูปการอ่านค่ากล้องตลอดเวลา
    if (isCameraReady) {
        window.requestAnimationFrame(predictLoop);
    }
}

function drawCamera(pose) {
    cameraCtx.drawImage(webcam.canvas, 0, 0);
    if (pose) {
        tmPose.drawKeypoints(pose.keypoints, 0.5, cameraCtx);
        tmPose.drawSkeleton(pose.keypoints, 0.5, cameraCtx);
    }
}

// ===============================
// 4. ระบบการเล่น (Game Logic)
// ===============================
function startGame() {
    gameRunning = true;
    score = 0;
    activeNotes = [];
    frameCount = 0;
    noteSpeed = 4; // ความเร็วเริ่มต้น
    startTime = Date.now();
    document.getElementById("gameOverScreen").classList.add("hidden");
    gameLoop();
}

function restartGame() {
    startGame();
}

function spawnNote() {
    const laneIndex = Math.floor(Math.random() * 3); // 0=ซ้าย, 1=กลาง, 2=ขวา
    let requiredPose, color;

    // เงื่อนไขสีและท่าทางตามเลน
    if (laneIndex === 0) { // เลนซ้าย
        if (Math.random() > 0.5) {
            requiredPose = poses.LEFT_ARM;
            color = "#2ecc71"; // สีเขียว
        } else {
            requiredPose = poses.LEFT_NECK;
            color = "#3498db"; // สีฟ้า
        }
    } else if (laneIndex === 1) { // เลนกลาง
        requiredPose = poses.CENTER_ARM;
        color = "#9b59b6"; // สีม่วง
    } else { // เลนขวา
        if (Math.random() > 0.5) {
            requiredPose = poses.RIGHT_ARM;
            color = "#2ecc71"; // สีเขียว
        } else {
            requiredPose = poses.RIGHT_NECK;
            color = "#3498db"; // สีฟ้า
        }
    }

    const isLongNote = Math.random() > 0.75; // โอกาส 25% เป็นโน้ตยาว
    
    activeNotes.push({
        lane: laneIndex,
        pose: requiredPose,
        color: color,
        type: isLongNote ? "long" : "short",
        y: -150, 
        length: isLongNote ? 250 : 100
    });
}

function updateGame() {
    if (!gameRunning) return;

    frameCount++;
    elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    document.getElementById("timeDisplay").innerText = elapsedTime;
    document.getElementById("scoreDisplay").innerText = score;

    // เพิ่มความยาก (ความเร็วตก) ตามเวลา
    if (frameCount % 600 === 0) { noteSpeed += 0.3; }

    // ปล่อยโน้ตใหม่ (เร็วขึ้นตามเวลา)
    let spawnRate = Math.max(40, 90 - Math.floor(frameCount / 100));
    if (frameCount % spawnRate === 0) {
        spawnNote();
    }

    for (let i = activeNotes.length - 1; i >= 0; i--) {
        let note = activeNotes[i];
        note.y += noteSpeed;

        let noteBottom = note.y;
        let noteTop = note.y - note.length;

        // เช็กระยะ Hit Zone
        if (noteBottom > hitZoneY && noteTop < hitZoneY + hitZoneHeight) {
            // ถ้ายืนทำท่าตรงกับบล็อกที่กำลังผ่าน
            if (currentPose === note.pose) {
                if (note.type === "short") {
                    score += 100;
                    activeNotes.splice(i, 1);
                    continue;
                } else if (note.type === "long") {
                    score += 2; // คะแนนไหลขึ้นต่อเนื่อง
                    note.length -= noteSpeed; // หดตัวบล็อก
                    if (note.length <= 0) {
                        activeNotes.splice(i, 1);
                        continue;
                    }
                }
            }
        }

        // เช็ก Game Over: บล็อกหลุดขอบล่างไปแล้วโดยไม่ถูกทำลาย
        if (noteTop > hitZoneY + hitZoneHeight) {
            gameOver();
        }
    }
}

// ===============================
// 5. การแสดงผลกราฟิก (Rendering)
// ===============================
function drawGame() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // วาดพื้นหลังเลน
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);
        
        // เส้นแบ่งเลน
        if (i > 0) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(i * laneWidth, 0);
            ctx.lineTo(i * laneWidth, gameCanvas.height);
            ctx.stroke();
        }
    }

    // วาด Hit Zone
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);

    // วาดตัวโน้ต
    for (let note of activeNotes) {
        let x = note.lane * laneWidth;
        let padding = 15;
        let drawWidth = laneWidth - (padding * 2);

        ctx.fillStyle = note.color;
        
        if (note.type === "short") {
            // บล็อกสั้น
            ctx.beginPath();
            ctx.roundRect(x + padding, note.y - note.length, drawWidth, note.length, 10);
            ctx.fill();
            
            // ขอบไฮไลต์สว่าง
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // บล็อกยาว
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.roundRect(x + padding, note.y - note.length, drawWidth, note.length, 10);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            // หัวบล็อกยาวเพื่อสร้างมิติ
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.beginPath();
            ctx.roundRect(x + padding, note.y - 15, drawWidth, 15, {bl: 10, br: 10});
            ctx.fill();
            
            // ใส่ข้อความใบ้ท่า
          /*  ctx.fillStyle = "#fff";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            let shortText = note.pose.includes("แขน") ? "แขน" : "คอ";
            ctx.fillText(shortText, x + laneWidth/2, note.y - 25);
        */
            }
    }
}

function gameLoop() {
    if (!gameRunning) return;
    updateGame();
    drawGame();
    window.requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    document.getElementById("gameOverScreen").classList.remove("hidden");
    document.getElementById("finalTime").innerText = elapsedTime;
    document.getElementById("finalScore").innerText = score;
}
