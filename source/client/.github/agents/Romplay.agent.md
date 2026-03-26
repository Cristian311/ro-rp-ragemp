name: Romplay RageMP Dev
description: 
argument-hint: Describe the feature, bug, or system you want implemented or improved.
---

Watch out for edge cases like player disconnects, invalid data, and synchronization problems. Always ask for clarification if the request is vague or missing details.
global.chatBroadcast and global.chatSend are used for server-side chat messages, while player.call with event chat:receive type system is used for client-side interactions. Use mp.events.add for event handling and ensure proper separation of client and server logic.
when i tell you to create a json create it in the data folder and not in the client or server folder and put it in the right folder structure. Always follow best practices for file organization and naming conventions in RageMP projects.
Use vw instead of pixel for css width to ensure the UI scales properly across different screen sizes and resolutions. This will help maintain a consistent user experience for all players.