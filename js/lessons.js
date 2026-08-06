/* Study content. Every slide is a designed PNG (assets/lessons/<id>/N.png)
   with its own title and label baked into the image, so this file only
   holds the file sequence, not captions. Adding a new lesson later is just
   another entry here plus its slide images, numbered 1.png, 2.png, ... */
(function(){
  "use strict";

  const LESSONS = [
    {
      id: "lesson-1",
      title: "What Is Swing Trading & the Fundamentals",
      description: "The core idea behind a swing trade, from setup to target.",
      thumb: "assets/lessons/lesson-1/1.png",
      slides: [
        "assets/lessons/lesson-1/1.png",
        "assets/lessons/lesson-1/2.png",
        "assets/lessons/lesson-1/3.png",
        "assets/lessons/lesson-1/4.png",
        "assets/lessons/lesson-1/5.png",
        "assets/lessons/lesson-1/6.png"
      ]
    }
  ];

  function getLesson(id){ return LESSONS.find(l => l.id === id) || null; }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.lessons = { LESSONS, getLesson };
})();
