let apiEndpoint = "";

// Fetch the local configuration file to load the API endpoint
fetch("./endpoints_config.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error("Could not load endpoints_config.json");
    }
    return response.json();
  })
  .then((config) => {
    apiEndpoint = config.transcoder_api_endpoint;
    console.log("Loaded API Endpoint:", apiEndpoint);

    // Proceed with the existing logic once the endpoint is loaded
    initializeApp();
  })
  .catch((error) => {
    console.error("Error loading configuration file:", error.message);
    statusMessage.textContent = "Error loading configuration. Please try again later.";
  });

function initializeApp() {
  // Socket.IO Initialization
  const socket = io(`${apiEndpoint}/transcoding`);

  // Get references to elements
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const startTranscodingButton = document.getElementById("startTranscodingButton");
  const statusMessage = document.getElementById("statusMessage");
  const mediaList = document.getElementById("mediaList");

  let uploadedFilename = "";

  // Drag and Drop Logic
  uploadArea.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadArea.classList.remove("dragover");

    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith("video")) {
      const formData = new FormData();
      formData.append("file", file);

      // Upload file to backend
      fetch(`${apiEndpoint}/upload`, {
        method: "POST",
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.message === "File uploaded successfully") {
            uploadedFilename = data.uploaded_file;
            statusMessage.textContent = `Uploaded: ${uploadedFilename}`;
            startTranscodingButton.disabled = false;
          } else {
            statusMessage.textContent = `Upload failed: ${data.message}`;
          }
        })
        .catch((error) => {
          statusMessage.textContent = `Error: ${error.message}`;
        });
    } else {
      statusMessage.textContent = "Please upload a valid video file.";
    }
  });

  // File input change event (for file selection)
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file && file.type.startsWith("video")) {
      const formData = new FormData();
      formData.append("file", file);

      // Upload file to backend
      fetch(`${apiEndpoint}/upload`, {
        method: "POST",
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.message === "File uploaded successfully") {
            uploadedFilename = data.uploaded_file;
            statusMessage.textContent = `Uploaded: ${uploadedFilename}`;
            startTranscodingButton.disabled = false;
          } else {
            statusMessage.textContent = `Upload failed: ${data.message}`;
          }
        })
        .catch((error) => {
          statusMessage.textContent = `Error: ${error.message}`;
        });
    } else {
      statusMessage.textContent = "Please upload a valid video file.";
    }
  });

  // Start Transcoding Button Logic
  startTranscodingButton.addEventListener("click", () => {
    if (!uploadedFilename) {
      statusMessage.textContent = "No file uploaded for transcoding.";
      return;
    }

    const targetFormat = document.getElementById("targetFormat").value;

    // Disable button and update status
    startTranscodingButton.disabled = true;
    statusMessage.textContent = "Transcoding...";

    // Create a new media item for transcoding progress
    const mediaItem = document.createElement("div");
    mediaItem.classList.add("mediaItem");
    const mediaName = document.createElement("span");
    mediaName.textContent = `Transcoding: ${uploadedFilename}`;
    const progressBarContainer = document.createElement("div");
    progressBarContainer.classList.add("progress-bar-container");
    const progressBar = document.createElement("div");
    progressBar.classList.add("progress-bar");
    progressBar.style.width = "0%";
    progressBarContainer.appendChild(progressBar);
    mediaItem.appendChild(mediaName);
    mediaItem.appendChild(progressBarContainer);
    mediaList.innerHTML = "";
    mediaList.appendChild(mediaItem);

    // Emit transcoding request to the Flask-SocketIO server
    socket.emit("transcode_progress", {
      filename: uploadedFilename,
      target_format: targetFormat,
    });

    // Listen for real-time progress updates
    socket.on("transcoding_update", function (data) {
      console.log("Transcoding progress: " + data.progress + "%");
      progressBar.style.width = `${data.progress}%`;
      if (data.progress >= 100) {
        statusMessage.textContent = `Transcoding complete! File: ${uploadedFilename}`;
        startTranscodingButton.disabled = false; // Enable button again after completion
      }
    });

    // Send the transcoding request to the server
    fetch(`${apiEndpoint}/transcode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: uploadedFilename,
        target_format: targetFormat,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.message === "Transcoding completed successfully") {
          statusMessage.textContent = `Transcoding complete!`;

          // Create a download link for the transcoded file
          const downloadLink = document.createElement("a");
          downloadLink.href = data.download_url;
          downloadLink.textContent = "Click here to download the transcoded file";
          downloadLink.target = "_blank"; // Open the download link in a new tab
          mediaList.appendChild(downloadLink);
        } else {
          statusMessage.textContent = `Transcoding Error: ${data.error}`;
        }
      })
      .catch((error) => {
        statusMessage.textContent = `Transcoding Error: ${error.message}`;
      })
      .finally(() => {
        startTranscodingButton.disabled = false;
      });
  });
}
