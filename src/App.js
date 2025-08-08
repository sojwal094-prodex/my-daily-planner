    import React, { useState, useEffect, useRef } from 'react';
    import { initializeApp } from 'firebase/app';
    import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
    import { getFirestore, collection, addDoc, updateDoc, doc, query, where, onSnapshot } from 'firebase/firestore';

    // Helper to convert PCM audio data to WAV format
    function pcmToWav(pcmData, sampleRate) {
      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);

      // RIFF chunk
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + pcmData.byteLength, true); // ChunkSize
      writeString(view, 8, 'WAVE');

      // FMT sub-chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
      view.setUint16(22, 1, true); // NumChannels (Mono)
      view.setUint32(24, sampleRate, true); // SampleRate
      view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
      view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
      view.setUint16(34, 16, true); // BitsPerSample

      // DATA sub-chunk
      writeString(view, 36, 'data');
      view.setUint32(40, pcmData.byteLength, true); // Subchunk2Size

      const audioBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
      return audioBlob;
    }

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    function base64ToArrayBuffer(base64) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    // IMPORTANT: You MUST replace these placeholder values with YOUR OWN Firebase project configuration details.
    // 1. Go to Firebase Console (console.firebase.google.com)
    // 2. Select or create your project.
    // 3. Go to Project settings (gear icon next to "Project overview").
    // 4. Under "Your apps", click the web icon (</>) to add a new web app (if you haven't).
    //    Firebase will provide you with a 'firebaseConfig' object. Copy its values here.
    // 5. In the Firebase Console, go to "Build" -> "Authentication".
    // 6. Click on the "Get started" button if it's your first time.
    // 7. Go to the "Sign-in method" tab.
    // 8. Find "Anonymous" and ENABLE it. Make sure to click "Save"!
 
      
  const firebaseConfig = {
  apiKey: "AIzaSyD2wouQa3ANhGrRpgCewvPRKbTGp9S1QrY",
  authDomain: "my-daily-planner-backend.firebaseapp.com",
  projectId: "my-daily-planner-backend",
  storageBucket: "my-daily-planner-backend.firebasestorage.app",
  messagingSenderId: "97838416790",
  appId: "1:97838416790:web:0d33f275dc89e5497bd3b7",
  measurementId: "G-9PG03Y7ZJB"
};

    // This is a constant ID for your deployed app, used in Firestore paths.
    const DEPLOYED_APP_ID = "my-daily-planner-web"; 

    // Initialize Firebase once globally
    let app, db, auth;
    // Check if all necessary config values appear to be provided (not placeholders)
    const isFirebaseConfigComplete =
      firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" &&
      firebaseConfig.projectId && firebaseConfig.projectId !== "YOUR_PROJECT_ID" &&
      firebaseConfig.appId && firebaseConfig.appId !== "YOUR_APP_ID";

    try {
      if (isFirebaseConfigComplete) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        console.log("Firebase initialized with provided config.");
      } else {
        console.warn("Firebase configuration is incomplete. Please replace ALL placeholder values in firebaseConfig. Task data persistence will NOT work.");
        app = null;
        db = null;
        auth = null;
      }
    } catch (e) {
      console.error("Failed to initialize Firebase. Please check your firebaseConfig object for errors:", e);
      app = null;
      db = null;
      auth = null;
    }


    const TaskItem = ({ task, onToggleComplete }) => (
      <div className="flex items-center justify-between p-3 my-2 bg-gray-100 rounded-lg shadow-sm">
        <span className={`text-lg ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
          {task.text}
        </span>
        <button
          onClick={() => onToggleComplete(task.id, !task.completed)}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200
            ${task.completed ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
        >
          {task.completed ? 'Undo' : 'Complete'}
        </button>
      </div>
    );

    const TaskInput = ({ onAddTask }) => {
      const [taskText, setTaskText] = useState('');

      const handleSubmit = (e) => {
        e.preventDefault();
        if (taskText.trim()) {
          onAddTask(taskText.trim());
          setTaskText('');
        }
      };

      return (
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 mb-6 p-4 bg-white rounded-lg shadow">
          <input
            type="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="Add a new task..."
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition duration-300 ease-in-out"
          >
            Add Task
          </button>
        </form>
      );
    };

    const DateNavigator = ({ selectedDate, onDateChange, onGenerateAudio }) => {
      const formatDate = (date) => date.toISOString().split('T')[0];

      const handleDateChange = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        onDateChange(newDate);
      };

      return (
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => handleDateChange(-1)}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Prev Day
          </button>
          <input
            type="date"
            value={formatDate(selectedDate)}
            onChange={(e) => onDateChange(new Date(e.target.value))}
            className="p-2 border border-gray-300 rounded-lg text-center"
          />
          <button
            onClick={() => handleDateChange(1)}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition duration-200"
          >
            Next Day
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block ml-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={onGenerateAudio}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-purple-700 transition duration-300 ease-in-out ml-4"
          >
            Generate Audio Summary
          </button>
        </div>
      );
    };

    export default function App() {
      const [tasks, setTasks] = useState([]);
      const [selectedDate, setSelectedDate] = useState(new Date());
      const [userId, setUserId] = useState(null);
      const [isAuthReady, setIsAuthReady] = useState(false);
      const [loadingAudio, setLoadingAudio] = useState(false);
      const audioRef = useRef(null);

      useEffect(() => {
        // Authenticate with Firebase if 'auth' object is available
        if (auth) { // 'auth' is null if firebaseConfig is incomplete or Firebase initialization failed
          const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
              setUserId(user.uid);
            } else {
              try {
                // Sign in anonymously for a deployed app
                await signInAnonymously(auth);
              } catch (error) {
                console.error("Firebase authentication error:", error);
              }
            }
            setIsAuthReady(true);
          });
          return () => unsubscribe();
        } else {
          console.warn("Firebase authentication not initialized. Task data persistence will not work. Check Firebase config and console.");
          setUserId(crypto.randomUUID()); // Generate a temporary user ID for UI if Firebase isn't active
          setIsAuthReady(true); // Allow UI to load even if Firebase is not fully set up
        }
      }, []); // Run only once on component mount

      // Listen for tasks for the selected date
      useEffect(() => {
        if (!isAuthReady || !userId) return; // Ensure userId is available (either Firebase UID or temporary)

        // Only attempt Firestore operations if 'db' is initialized
        if (!db) {
            console.warn("Firestore not initialized. Cannot fetch tasks.");
            setTasks([]); // Clear tasks if db is not available
            return;
        }


        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Firestore collection path uses DEPLOYED_APP_ID and userId
        const tasksCollectionRef = collection(db, `artifacts/${DEPLOYED_APP_ID}/users/${userId}/tasks`);
        const q = query(tasksCollectionRef,
          where('date', '>=', startOfDay.getTime()),
          where('date', '<=', endOfDay.getTime())
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedTasks = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setTasks(fetchedTasks.sort((a, b) => a.date - b.date)); // Sort by date
        }, (error) => {
          console.error("Error fetching tasks:", error);
        });

        return () => unsubscribe();
      }, [selectedDate, userId, isAuthReady]); // Re-run when date or auth state changes

      const addTask = async (text) => {
        if (!db || !userId) {
            console.error("Firebase not initialized or user not authenticated. Cannot add task.");
            return;
        }

        try {
          await addDoc(collection(db, `artifacts/${DEPLOYED_APP_ID}/users/${userId}/tasks`), {
            text,
            date: selectedDate.getTime(), // Store as timestamp
            completed: false,
          });
        } catch (e) {
          console.error("Error adding document: ", e);
        }
      };

      const toggleTaskComplete = async (id, completed) => {
        if (!db || !userId) {
            console.error("Firebase not initialized or user not authenticated. Cannot update task.");
            return;
        }

        try {
          const taskRef = doc(db, `artifacts/${DEPLOYED_APP_ID}/users/${userId}/tasks`, id);
          await updateDoc(taskRef, {
            completed: completed,
          });
        } catch (e) {
          console.error("Error updating document: ", e);
        }
      };

      const completedTasks = tasks.filter(task => task.completed).length;
      const totalTasks = tasks.length;
      const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      const generateAudioSummary = async () => {
        setLoadingAudio(true);
        const summaryText = totalTasks > 0
          ? `On ${selectedDate.toDateString()}, you had ${totalTasks} tasks. You completed ${completedTasks} tasks, which is ${progressPercentage.toFixed(0)} percent of your total tasks for the day. Great job!`
          : `On ${selectedDate.toDateString()}, you have no tasks recorded. Time to add some!`;

        try {
          // This API call requires an API key for the Gemini API.
          // For a deployed app, you would need to set up a proxy or a server-side function
          // to call this API securely, as exposing an API key directly in client-side
          // code is not recommended for production applications.
          // For this demonstration, the API key is left blank as it's assumed
          // to be handled by a secure environment or a placeholder for now.
          const payload = {
            contents: [{
              parts: [{ text: summaryText }]
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" }
                }
              }
            },
            model: "gemini-2.5-flash-preview-tts"
          };

          const apiKey = ""; // You would replace this with your actual Gemini API key if using directly in a deployed app
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          const part = result?.candidates?.[0]?.content?.parts?.[0];
            const mimeType = part?.inlineData?.mimeType;
          const audioData = part?.inlineData?.data;

          if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000; // Default if not found

            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);

            if (audioRef.current) {
              audioRef.current.src = audioUrl;
              audioRef.current.play().catch(e => console.error("Error playing audio:", e));
            }
          } else {
            console.error("Audio data or mime type missing from response.");
          }
        } catch (error) {
          console.error("Error generating or playing audio:", error);
          // Only show message if user has valid Firebase setup
          if (isFirebaseConfigComplete) {
              alert("Error generating audio. Please check your network or API key setup if this persists.");
          }
        } finally {
          setLoadingAudio(false);
        }
      };


      if (!isAuthReady) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="text-xl font-semibold text-gray-700">Loading application...</div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-inter antialiased">
          <div className="max-w-xl mx-auto bg-white rounded-xl shadow-2xl p-6 md:p-8 my-8">
            <h1 className="text-4xl font-extrabold text-center text-blue-800 mb-8 tracking-tight">
              My Daily Planner
            </h1>

            {userId && (
              <p className="text-sm text-gray-600 text-center mb-6 px-4 py-2 bg-blue-50 rounded-lg">
                Your User ID: <span className="font-mono text-blue-800 break-all">{userId}</span>
                {!isFirebaseConfigComplete && (
                    <span className="text-red-600 font-semibold block mt-1">
                        (Tasks will NOT save unless Firebase Config is updated & Auth is enabled!)
                    </span>
                )}
              </p>
            )}

            <DateNavigator
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onGenerateAudio={generateAudioSummary}
            />

            <TaskInput onAddTask={addTask} />

            <div className="mb-6 p-4 bg-blue-100 rounded-lg shadow-inner">
              <h2 className="text-2xl font-bold text-blue-700 mb-3">Progress for {selectedDate.toDateString()}</h2>
              <div className="w-full bg-blue-200 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <p className="text-blue-800 text-sm mt-2 font-medium">
                {completedTasks} of {totalTasks} tasks completed ({progressPercentage.toFixed(0)}%)
              </p>
            </div>

            {loadingAudio && (
              <div className="flex items-center justify-center p-4 bg-yellow-100 rounded-lg mb-4">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-yellow-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-yellow-700">Generating audio summary...</span>
              </div>
            )}
            <audio ref={audioRef} controls className="w-full mt-4 mb-6 hidden"></audio> {/* Hidden, controlled by JS */}

            <h2 className="text-2xl font-bold text-gray-800 mb-4">Tasks for {selectedDate.toDateString()}</h2>
            {tasks.length === 0 ? (
              <p className="text-gray-600 text-center p-4 bg-gray-50 rounded-lg">No tasks for this day yet!</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskItem key={task.id} task={task} onToggleComplete={toggleTaskComplete} />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    