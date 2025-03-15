import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import mqtt from "mqtt";
import { FaPaperclip, FaPaperPlane } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import './output.css'

const App = () => {
  const [file, setFile] = useState(null);
  const [textFilePath, setTextFilePath] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const chatEndRef = useRef(null);
  const notify = (status, msg) => {
    if (status === "success")
      toast.success(msg, { position: "top-right", autoClose: 3000 });
    else toast.error(msg, { position: "top-right", autoClose: 3000 });
  };
  useEffect(() => {
    const client=mqtt.connect('ws://65.2.179.139:9001/mqtt', {
      username: 'gwortssh',
      password: 'F3Ce-SNdObpe',
    });
    client.on("connect", () => {});
    client.subscribe("pdf-chat/response");

    client.on("message", (topic, message) => {
      const { question, response } = JSON.parse(message.toString());
      setChat((prevChat) =>
        prevChat.map((msg) =>
          msg.question === question &&
          msg.answer === "Waiting for AI response..."
            ? { ...msg, answer: response }
            : msg
        )
      );
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const uploadPDF = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) {
      notify("error", "⚠️ Please select a valid pdf.");
      return;
    }
    const fileName = selectedFile.name;
    const fileExtension = fileName.split(".").pop().toLowerCase();
    if (fileExtension !== "pdf") {
      notify("error", "⚠️ Only PDF files are allowed!");
      return;
    }
    setFile(selectedFile);
    const formData = new FormData();
    formData.append("pdf", selectedFile);
    try{const response = await axios.post("http://localhost:8080/upload", formData);
    setTextFilePath(response.data.textFilePath);
    notify("success", "📄 PDF Uploaded Successfully!");
    setChat((prev) => [
      ...prev,
      { question:"Generate summary of context provided", answer: "Waiting for AI response..." },
    ]);
    await axios.post("http://localhost:8080/ask", {
      question:"Generate summary of context provided",
      context: response.data.textFilePath,
    });
  }
    catch(error){
      if(error.response){
        notify("error",error.response.data.error);
      }
    }
    event.target.value=null;
  };

  const askQuestion = async () => {
    if (!textFilePath) {
      notify("error", "⚠️ Please upload a PDF first!");
      return;
    } else if (question.trim().length == 0) {
      notify("error", "⚠️ Please enter a valid question!");
      return;
    }

    setChat((prev) => [
      ...prev,
      { question, answer: "Waiting for AI response..." },
    ]);
    try{await axios.post("http://localhost:8080/ask", {
      question,
      context: textFilePath,
    });}
    catch(error){
      notify("error",error.response.data.error);
    }
     setQuestion("");
  };

  return (
    <div className="flex flex-col justify-center align-center h-full mx-auto rounded-lg text-center">
      <ToastContainer />
      <div className="container">
        <div className="bg-green-500 text-white py-4 px-6 text-lg font-bold flex justify-between rounded-t-lg">
          PDF Chatbot
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {chat.map((msg, index) => (
            <div key={index}>
              <div className="flex justify-end">
                <div className="rounded-lg px-4 py-2 my-1 max-w-xs bg-green-500 text-white">
                  {`${msg.question}`}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-2 my-1 max-w-xs bg-gray-300 text-black">
                  {`🤖: ${msg.answer}`}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef}></div>
        </div>

        <div className="flex items-center p-4 bg-white border-t relative rounded-b-lg">
          <label className="absolute left-4 cursor-pointer">
            <FaPaperclip size={20} />
            <input type="file" className="hidden" onChange={uploadPDF} />
          </label>

          <input
            type="text"
            className="flex-1 p-2 border rounded-lg ml-8"
            placeholder="Type your question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <button
            className="ml-2 bg-green-500 text-white p-2 rounded-lg"
            onClick={askQuestion}
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
