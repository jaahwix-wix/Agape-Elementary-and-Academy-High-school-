/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Student, UserRole } from '../types';

/**
 * Institutional Pre-Generated System Keys Manifest
 * These keys are permanently embedded for Agape Elementary and Academy High school
 * so that the system never prompts any user for keys or passcodes.
 */
export const PREGENERATED_SYSTEM_KEYS = {
  admin: {
    role: 'admin' as UserRole,
    title: 'Super Admin / Principal',
    key: 'AGP-ADMIN-2026',
    altPin: '1234',
    authorizedUser: 'Dr. Emmanuel Sesay (Principal)',
    email: 'jaahwix@gmail.com'
  },
  teacher: {
    role: 'teacher' as UserRole,
    title: 'Academic Faculty / Teacher',
    key: 'AGP-TCH-1001',
    altPin: '1234',
    authorizedUser: 'Head of Academics & Form Masters',
    email: 'academic.staff@agapeacademy.edu.sl'
  },
  bursar: {
    role: 'bursar' as UserRole,
    title: 'Bursar / Financial Officer',
    key: 'AGP-BURSAR-2026',
    altPin: '1234',
    authorizedUser: 'Accounts & Bursary Controller',
    email: 'finance.bursar@agapeacademy.edu.sl'
  },
  transport: {
    role: 'transport' as UserRole,
    title: 'Transport & Logistics Coordinator',
    key: 'AGP-FLEET-2026',
    altPin: '1234',
    authorizedUser: 'Fleet Logistics Officer',
    email: 'fleet.logistics@agapeacademy.edu.sl'
  },
  student_parent: {
    role: 'student_parent' as UserRole,
    title: 'Student & Guardian Portal',
    key: 'AGP-PAR-8492',
    altPin: 'AGP-2024-001',
    authorizedUser: 'Mohamed Santigie Kamara (SSS 3)',
    email: 'parent.portal@agapeacademy.edu.sl'
  }
};

/**
 * Generates a consistent alphanumeric code with a distinct prefix
 */
export function generateTeacherCode(seed = 1000): string {
  const num = Math.floor(1000 + (seed % 8999));
  return `TCH-${num}`;
}

export function generateParentCode(seed = 1000): string {
  const num = Math.floor(1000 + (seed % 8999));
  return `PAR-${num}`;
}

export function generateStudentCode(seed = 1000): string {
  const num = Math.floor(1000 + (seed % 8999));
  return `STU-${num}`;
}

/**
 * Ensures a teacher object has an assigned pre-generated access code
 */
export function ensureTeacherAccessCode(teacher: Teacher, index = 0): Teacher {
  if (teacher.accessCode && teacher.accessCode.trim() !== '') {
    return teacher;
  }
  return {
    ...teacher,
    accessCode: `TCH-${1000 + (index + 1) * 100 + ((index + 1) % 9)}`,
  };
}

/**
 * Ensures a student object has assigned pre-generated parent & student access codes
 */
export function ensureStudentAccessCodes(student: Student, index = 0): Student {
  let updated = { ...student };
  if (!updated.parentAccessCode || updated.parentAccessCode.trim() === '') {
    // Generate deterministic parent access code based on admission number or index
    const seed = index + (student.admissionNumber ? student.admissionNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 1000);
    updated.parentAccessCode = `PAR-${1000 + (seed % 8990)}`;
  }
  if (!updated.studentAccessCode || updated.studentAccessCode.trim() === '') {
    updated.studentAccessCode = updated.admissionNumber || `STU-${1000 + ((index + 1) * 11) % 8990}`;
  }
  return updated;
}

/**
 * Search teacher by access code or email or staffId
 */
export function findTeacherByCode(teachers: Teacher[], rawInput: string): Teacher | undefined {
  const clean = rawInput.trim().toUpperCase();
  if (!clean || clean === '1234' || clean === 'AUTO' || clean.includes('TCH')) {
    // Return first teacher if generic key used
    return teachers[0];
  }
  return teachers.find(t => 
    (t.accessCode && t.accessCode.toUpperCase() === clean) ||
    (t.staffId && t.staffId.toUpperCase() === clean) ||
    (t.email && t.email.toUpperCase() === clean) ||
    t.id.toUpperCase() === clean
  ) || teachers[0];
}

/**
 * Search student record by parent code or student admission number
 */
export function findStudentByParentCode(students: Student[], rawInput: string): Student | undefined {
  const clean = rawInput.trim().toUpperCase();
  if (!clean || clean === '1234' || clean === 'AUTO') return students[0];
  return students.find(s => 
    (s.parentAccessCode && s.parentAccessCode.toUpperCase() === clean) ||
    (s.admissionNumber && s.admissionNumber.toUpperCase() === clean) ||
    (s.parentPhone && s.parentPhone.replace(/\s+/g, '') === clean.replace(/\s+/g, ''))
  ) || students[0];
}

/**
 * Search student record by student code or admission number
 */
export function findStudentByStudentCode(students: Student[], rawInput: string): Student | undefined {
  const clean = rawInput.trim().toUpperCase();
  if (!clean || clean === '1234' || clean === 'AUTO') return students[0];
  return students.find(s => 
    (s.studentAccessCode && s.studentAccessCode.toUpperCase() === clean) ||
    (s.admissionNumber && s.admissionNumber.toUpperCase() === clean)
  ) || students[0];
}
