/**
 * course.controller.js
 * ---------------------
 * CRUD for courses. Instructors create and own courses; TAs are assigned.
 *
 * Routes (wired in course.routes.js)
 *  POST   /api/courses          – create a course          [instructor]
 *  GET    /api/courses          – list my courses
 *  GET    /api/courses/:id      – get single course
 *  PATCH  /api/courses/:id      – update course            [instructor]
 *  DELETE /api/courses/:id      – delete course            [instructor]
 */

import Course from "../models/Course.model.js";

// POST /api/courses
export async function createCourse(req, res) {
  try {
    const { name, code, description, semester } = req.body;
    if (!name || !code) {
      return res.status(400).json({ message: "name and code are required." });
    }
    const course = await Course.create({
      name, code, description, semester,
      instructor: req.user._id,
    });
    return res.status(201).json({ message: "Course created.", course });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A course with this code already exists for this semester." });
    }
    console.error("[course.createCourse]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// GET /api/courses
export async function listCourses(req, res) {
  try {
    let courses;
    if (req.user.role === "instructor") {
      courses = await Course.find({ instructor: req.user._id, isArchived: false })
        .populate("tas", "name email")
        .sort({ createdAt: -1 });
    } else {
      courses = await Course.find({ tas: req.user._id, isArchived: false })
        .populate("instructor", "name email")
        .sort({ createdAt: -1 });
    }
    return res.status(200).json({ courses });
  } catch (err) {
    console.error("[course.listCourses]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// GET /api/courses/:id
export async function getCourse(req, res) {
  try {
    const course = await Course.findById(req.params.id)
      .populate("instructor", "name email")
      .populate("tas", "name email");
    if (!course) return res.status(404).json({ message: "Course not found." });
    return res.status(200).json({ course });
  } catch (err) {
    console.error("[course.getCourse]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// PATCH /api/courses/:id
export async function updateCourse(req, res) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found." });
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can update it." });
    }
    const { name, code, description, semester, isArchived } = req.body;
    if (name !== undefined) course.name = name;
    if (code !== undefined) course.code = code;
    if (description !== undefined) course.description = description;
    if (semester !== undefined) course.semester = semester;
    if (isArchived !== undefined) course.isArchived = isArchived;
    await course.save();
    return res.status(200).json({ message: "Course updated.", course });
  } catch (err) {
    console.error("[course.updateCourse]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// POST /api/courses/:id/tas  — assign a TA by email
export async function assignTa(req, res) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found." });
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can assign TAs." });
    }
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "email is required." });

    // Import User model dynamically to avoid circular deps
    const { default: User } = await import("../models/User.model.js");
    const ta = await User.findOne({ email: email.toLowerCase().trim() });
    if (!ta) return res.status(404).json({ message: `No user found with email "${email}".` });
    if (ta.role !== "ta") return res.status(400).json({ message: `${email} is not registered as a TA.` });
    if (course.tas.map(String).includes(ta._id.toString())) {
      return res.status(409).json({ message: "This TA is already assigned to the course." });
    }

    course.tas.push(ta._id);
    await course.save();
    await course.populate("tas", "name email");
    return res.status(200).json({ message: "TA assigned.", course });
  } catch (err) {
    console.error("[course.assignTa]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// DELETE /api/courses/:id/tas/:taId  — remove a TA
export async function removeTa(req, res) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found." });
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can remove TAs." });
    }
    course.tas = course.tas.filter((id) => id.toString() !== req.params.taId);
    await course.save();
    await course.populate("tas", "name email");
    return res.status(200).json({ message: "TA removed.", course });
  } catch (err) {
    console.error("[course.removeTa]", err);
    return res.status(500).json({ message: "Server error." });
  }
}

// DELETE /api/courses/:id
export async function deleteCourse(req, res) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found." });
    if (course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the course owner can delete it." });
    }
    await course.deleteOne();
    return res.status(200).json({ message: "Course deleted." });
  } catch (err) {
    console.error("[course.deleteCourse]", err);
    return res.status(500).json({ message: "Server error." });
  }
}