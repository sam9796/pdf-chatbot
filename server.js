import express from "express";
import cors from "cors";
import multer from "multer";
import mqtt from "mqtt";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


const upload = multer({ dest: "uploads/" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildPath = path.join(__dirname, "./pdf-chatbot-client/build");
app.use(express.static(buildPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const mqttClient=mqtt.connect('ws://65.2.179.139:9001/mqtt', {
  username: process.env.MQTT_USER_ID,
  password: process.env.MQTT_PASSWORD,
})
mqttClient.on("connect", () => {
  console.log("MQTT Connected!");
});

const extractTextFromPDFStream = async (pdfPath) => {
  return new Promise((resolve, reject) => {
    let extractedText = "";

    const process = spawn("pdftotext", ["-layout", pdfPath, "-"]); 

    process.stdout.on("data", (data) => {
        extractedText += data.toString();
    });

    process.stderr.on("data", (data) => {
        console.error(`Error extracting text: ${data}`);
    });

    process.on("close", (code) => {
        if (code === 0) {
            resolve(extractedText);
        } else {
            reject(new Error(`pdftotext process exited with code ${code}`));
        }
    });
});
};

const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now(); 
  const randomString = crypto.randomBytes(4).toString("hex");
  const fileExtension = path.extname(originalName); 
  return `${timestamp}-${randomString}${fileExtension}`; 
};

app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const extractedText = await extractTextFromPDFStream(req.file.path);
        const textFilePath = `uploads/${generateUniqueFilename(req.file.filename)}.txt`;
        const writeStream = fs.createWriteStream(textFilePath);
        writeStream.write(extractedText);
        writeStream.end();
        res.json({textFilePath });
    } catch (error) {
        res.status(500).json({ error: "Failed to process large PDF" });
    }
});

async function getResponse(question, context) {
  try {
    const response = await axios.post(
      "https://api.together.xyz/v1/chat/completions",
      {
        model: "meta-llama/Llama-3-8b-chat-hf",
        messages: [
          { role: "user", content: `Context: ${context}\nUser: ${question}` },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    throw new Error("Failed to get response from Llama 3.");
  }
}

app.post("/ask", async (req, res) => {
  const { question, context } = req.body;
  try {
    const extractedText = fs.readFileSync(context, "utf8");
    const response = await getResponse(question, extractedText);
    const payload = JSON.stringify({ question, response });
    mqttClient.publish("pdf-chat/response", payload, { qos: 1 }, (err) => {
      if (err) {
        res.status(500).json({error:"Failed to receive response."})
      } else { 
        res.json({ success: true });
      }
    });
  } catch (error) {
    const payload=JSON.stringify({question,response:error.message});
    mqttClient.publish("pdf-chat/response", payload, { qos: 1 }, (err) => {
      });
    res.status(500).json({error:error.message});
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("🚀 Server running on port 8080"));
