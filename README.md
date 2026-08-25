# YALI AI Companion

Build a personal AI companion called YALI AI.

YALI AI is not a generic chatbot. It is a fast, natural, personal AI conversation companion designed for everyday use.

Core Experience

The main goal is:

Open YALI AI → tap the mic → talk naturally → YALI listens → understands → responds instantly with voice.

The conversation should feel smooth and human-like, with minimum waiting time.

YALI AI Personality

YALI should feel:

Friendly

Casual

Smart

Supportive

Playful when appropriate

Natural

Context-aware

Never overly formal

YALI should communicate naturally in Tamil, English, and Tanglish.

Example:

User: "Yali enna pandra?"

YALI: "Naan inga dhaan da 😄 sollu, enna matter?"

User: "Java project la error varudhu."

YALI: "Okay da, screenshot anuppu. Namma together debug pannalaam."

Do not make every response long. For casual conversations, keep responses short and natural.

Voice AI

YALI AI must have a dedicated real-time Voice Mode.

The user should be able to:

Tap the microphone.

Speak naturally.

YALI detects the speech.

Understands the context.

Generates a response.

Responds automatically using voice.

The experience should feel like a live conversation, not a traditional voice assistant.

Fast Response

Speed is a major priority.

Implement:

Streaming AI responses

Fast speech recognition

Streaming text-to-speech where possible

Async processing

Minimal loading time

Immediate response generation

YALI should start speaking as soon as a useful portion of the response is ready.

Natural Interruption

The user must be able to interrupt YALI while it is speaking.

Example:

YALI: "Actually, Java-la you can solve this by—"

User: "Wait YALI, Spring Boot la sollu."

YALI immediately stops speaking and responds to the new request.

Voice Interface

Create a beautiful central AI interaction area.

Use a glowing animated YALI orb as the main visual element.

States:

🎙️ Listening
🧠 Thinking
🔊 Speaking

The orb should subtly react to the user's voice and YALI's speech.

Keep animations smooth and lightweight.

Chat Mode

Along with Voice Mode, provide a normal text chat.

Chat should support:

Conversation history

Streaming responses

Tamil + English + Tanglish

Context awareness

Quick message sending

Voice input

Personal Memory

YALI can optionally remember useful user preferences and conversation context.

Provide a Memory Settings section where the user can:

View memories

Delete individual memories

Clear all memories

Disable memory completely

Do not secretly store sensitive personal information.

UI / Visual Identity

Create a premium futuristic interface specifically branded as YALI AI.

Design:

Dark background

Glowing AI orb

Glassmorphism cards

Soft neon gradients

Smooth Framer Motion animations

Minimal layout

Modern typography

Responsive desktop and mobile design

The YALI AI logo/name should be clearly visible but not oversized.

Main Navigation

Keep navigation simple:

YALI AI

💬 Chat

🎙️ Voice

🧠 Memory

⚙️ Settings

The Voice screen should be the main experience.

Technology

Frontend:
React + TypeScript + Tailwind CSS + Framer Motion

Backend:
Spring Boot or Node.js

AI:
Gemini API

Voice:
Speech-to-Text + Text-to-Speech / low-latency voice API

Database:
MySQL or MongoDB

Important Requirement

Do NOT build YALI AI like a customer-support chatbot.

Do NOT make it overly formal.

Do NOT make every response lengthy.

YALI should understand casual conversation and respond naturally.

The final feeling should be:

"YALI is always there. I can just open it, talk, and continue my conversation."

Build YALI AI as a fast, personal, voice-first AI companion with a beautiful futuristic interface and natural Tamil-English conversation experience.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/94fe3998-04ac-45d8-951f-a3bee2dbaab6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
