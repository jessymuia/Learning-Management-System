// Typed client for the Production LMS API.
// Matches the Laravel backend contract: JSON envelope { data } / { error }, JWT bearer auth.

export type ApiError = { code: string; message: string; details?: unknown };

export class ApiException extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, error: ApiError) {
    super(error.message);
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

const TOKEN_KEY = 'lms_access_token';
const REFRESH_KEY = 'lms_refresh_token';

// Token storage — sessionStorage so a closed tab clears auth.
export const tokens = {
  get access() {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    window.sessionStorage.setItem(TOKEN_KEY, access);
    if (refresh) window.sessionStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_KEY);
  },
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean } = { auth: true }
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && tokens.access) {
    headers['Authorization'] = `Bearer ${tokens.access}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 / empty
  if (res.status === 204) return undefined as T;

  let payload: any = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err: ApiError = payload?.error ?? { code: 'error', message: `Request failed (${res.status})` };
    throw new ApiException(res.status, err);
  }

  return (payload?.data ?? payload) as T;
}

export const api = {
  get: <T>(path: string, opts?: { auth?: boolean }) => request<T>('GET', path, undefined, opts),
  getRaw: <T>(path: string, opts?: { auth?: boolean }): Promise<T> => {
    // like get() but returns the full payload without unwrapping .data
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api';
    return fetch(`${base}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }).then((r) => r.json() as Promise<T>);
  },
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) => request<T>('POST', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) => request<T>('PUT', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) => request<T>('PATCH', path, body, opts),
  delete: <T>(path: string, opts?: { auth?: boolean }) => request<T>('DELETE', path, undefined, opts),
};

// ── Domain types (mirror the API responses) ──
export type AuthResult = {
  user: { id: string; email: string; tenantId: string };
  accessToken: string;
  refreshToken: string;
  tokenType: string;
};

export type Course = {
  id: string;
  category_id: string;
  category_name?: string | null;
  enrolled_count?: number;
  is_paid?: boolean;
  price_minor?: number;
  currency?: string;
  shortname: string;
  fullname: string;
  format: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  path: string;
  sort_order: number;
};

export type Enrolment = {
  id: string;
  course_id: string;
  shortname: string;
  fullname: string;
  status: string;
};

export type Program = {
  id: string;
  slug: string;
  title: string;
  status: string;
  min_electives: number;
};

export type GradeSummary = {
  course_id: string;
  user_id: string;
  course_total: number | null;
  course_total_pct: number | null;
};

// ── Auth helpers ──
export const auth = {
  async login(tenantSlug: string, email: string, password: string) {
    const result = await api.post<AuthResult>(
      '/auth/login',
      { tenantSlug, email, password },
      { auth: false }
    );
    tokens.set(result.accessToken, result.refreshToken);
    return result;
  },
  async operatorLogin(email: string, password: string) {
    const result = await api.post<AuthResult>(
      '/auth/operator-login',
      { email, password },
      { auth: false }
    );
    tokens.set(result.accessToken, result.refreshToken);
    return result;
  },

  async register(tenantSlug: string, email: string, password: string) {
    const result = await api.post<AuthResult>(
      '/auth/register',
      { tenantSlug, email, password },
      { auth: false }
    );
    tokens.set(result.accessToken, result.refreshToken);
    return result;
  },
  async forgotPassword(tenantSlug: string, email: string) {
    return api.post<{ message: string; devToken?: string }>('/auth/forgot-password', { tenantSlug, email }, { auth: false });
  },
  async resetPassword(token: string, password: string) {
    return api.post<{ message: string }>('/auth/reset-password', { token, password }, { auth: false });
  },
  async me() {
    const response = await api.get<any>('/auth/me');

    // Normalize auth/me response so the frontend receives the same shape
    // whether the backend returns {data:{...}} or the object directly.
    const profile = response?.data ?? response ?? {};

    return {
      userId: profile.userId ?? profile.user_id ?? profile.user?.id,
      tenantId: profile.tenantId ?? profile.tenant_id ?? profile.user?.tenantId,
      email: profile.email ?? profile.user?.email,
      isSuperAdmin: Boolean(profile.isSuperAdmin ?? profile.is_super_admin),
      operatorLevel: profile.operatorLevel ?? profile.operator_level ?? null,
      roles: profile.roles ?? profile.role ? (Array.isArray(profile.roles) ? profile.roles : [profile.role]) : [],
      permissions: profile.permissions ?? [],
    };
  },
  logout() {
    tokens.clear();
  },
  get isAuthenticated() {
    return !!tokens.access;
  },
};

// ── Extended types for authoring + assessment ──
export type Quiz = {
  id: string;
  course_id: string;
  name: string;
  time_limit_s: number | null;
  attempts_allowed: number;
  grade_method: string;
};

export type QuizAttempt = {
  id: string;
  quiz_id?: string;
  user_id?: string;
  attempt_no: number;
  state: string;
  started_at: string;
  due_at: string | null;
  finished_at?: string | null;
  sumgrade?: number | null;
};

export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  due_at: string | null;
  cutoff_at: string | null;
  max_attempts: number;
};

export type Submission = {
  id: string;
  user_id?: string;
  email?: string;
  state: string;
  status?: string;
  workflow_state: string | null;
  text_content?: any;
  submitted_at: string | null;
  is_late: boolean;
  grade?: number | null;
  feedback?: any;
};

export type Section = { id: string; section_num: number; name: string | null; visible: boolean };
export type Notification = {
  id: string; channel: string; type: string; payload: any; read_at: string | null; created_at: string;
};
export type Credential = {
  id: string; verification_code: string; issued_at: string; type: string; name: string;
};

// ── Forums / groups / admin ──
export type Forum = { id: string; name: string; type: string; created_at: string };
export type Discussion = { id: string; subject: string; author_id: string; pinned: boolean; locked: boolean; created_at: string };
export type Group = { id: string; name: string; created_at: string };

// ── Quiz player ──
export type QuizSlot = {
  slot_num: number;
  question_version_id: string;
  qtype: string;
  questiontext: string;
  maxmark: number;
  choices?: { id: string; label: string }[];
};
export type AttemptStep = { slot_num: number; response: unknown; fraction?: number | null };

// ── Roles & programs management ──
export type Role = { id: string; name: string; permissions: string | null };
export type RoleAssignment = { id: string; user_id: string; email: string; role: string; level: string; instance_id: string | null };
export type ProgramUnit = {
  id: string; shortname: string; fullname: string;
  requirement: string; elective_group: string | null; in_programs: number;
};

export type Member = { id: string; email: string; status: string };

// ── Platform operator (super-admin) console ──
export type PlatformTenant = {
  id: string; name: string; slug: string; plan: string; status: string;
  created_at: string; members: number; courses: number;
};
export type PlatformStats = { active_tenants: number; total_users: number; total_courses: number };

export type Plan = { id: string; code: string; name: string; price_minor: number; currency: string; limits: unknown };
export type TenantBilling = { subscription_id: string; plan: string; amount_minor: number; currency?: string; payment_required: boolean; provider?: string; next?: string; idempotency_key?: string };

// ── Teacher tools: quiz authoring + assignment grading ──

// ── Reports dashboard ──
export type TenantOverview = { active_courses: number; active_members: number; active_programs: number; course_completions: number; active_enrolments?: number; completion_rate?: number; revenue_minor?: number; paid_orders?: number; pending_orders?: number;
};
export type CourseOverview = {
  active_enrolments: number; suspended_enrolments: number;
  completed: number; tracked: number; avg_pct: number | null; graded_learners: number;
};
export type AtRiskLearner = { user_id: string; email: string; course_total_pct: number | null };

// ── Course content builder ──
export type BuilderSection = { id: string; section_num: number; name: string | null; visible: boolean };
export type BuilderModule = { id: string; section_id: string; section_num: number; module_type: string; instance_id: string; sort_order: number; visible: boolean; title?: string };

// ── Enrolment management ──

// ── Enrolment management (course roster) ──
export type RosterEntry = { id: string; user_id: string; email: string; status: string; start_at: string | null; end_at: string | null };

// ── Integration settings ──
export type IntegrationSetting = {
  provider: string; enabled: boolean;
  config: Record<string, string>;
  secrets_set: Record<string, boolean>;
  updated_at: string | null;
};

// ── Assignment listing (teacher grading picker) ──
export type AssignmentRow = { id: string; title: string; due_at: string | null; submission_count: number; graded_count: number };


export type UserOrder = {
  id: string; item_type: string; item_id: string; amount_minor: number; currency: string;
  status: string; created_at: string; item_title?: string | null; receipt?: string | null; invoice_number?: string | null;
};
export type TenantOrder = {
  id: string; item_type: string; amount_minor: number; currency: string; status: string;
  created_at: string; buyer_email: string; item_title?: string | null;
};


export type Branding = {
  name?: string; logoUrl?: string | null;
  primaryColor: string; accentColor: string; defaultTheme: string;
};
export const branding = {
  mine: () => api.get<Branding>('/branding'),
  save: (b: Partial<Branding> & { displayName?: string; logoUrl?: string }) => api.put<Branding>('/branding', b),
};

export type NotifPrefs = Record<string, boolean>;
export const notificationPrefs = {
  get: () => api.get<NotifPrefs>('/notification-prefs'),
  save: (prefs: NotifPrefs) => api.put<NotifPrefs>('/notification-prefs', prefs),
};
export const notifications = {
  list: (unread = false) => api.get<Notification[]>(`/notifications${unread ? '?unread=true' : ''}`),
  markRead: (id: string) => api.post(`/notifications/${id}/read`, {}),
};


export type CourseAssignment = {
  id: string; title: string; due_at: string | null;
  submission_count?: number; graded_count?: number;
};
export type MySubmission = {
  id: string; state: string; workflow_state: string;
  text_content: Record<string, unknown> | null; submitted_at: string | null;
  is_late: boolean; feedback: Record<string, unknown> | null;
} | null;
export const assignments = {
  listForCourse: (courseId: string) => api.get<CourseAssignment[]>(`/courses/${courseId}/assignments`),
  mySubmission: (aid: string) => api.get<MySubmission>(`/assignments/${aid}/submission`),
  saveDraft: (aid: string, textContent: Record<string, unknown>) => api.put(`/assignments/${aid}/submission`, { textContent }),
  submit: (aid: string) => api.post(`/assignments/${aid}/submit`, {}),
};


export type CourseSection = { id: string; section_num: number; name: string; visible: boolean };
export type CourseLesson = { id: string; section_id: string; title: string; sort_order: number };
export type CourseModule = { id: string; section_id: string; section_num: number; module_type: string; instance_id: string; sort_order: number; title: string | null };
export type CompletionStatus = {
  course_state: string; completed_at: string | null;
  modules: { id: string; module_type: string; state: number }[];
};
export type LockedModulesResponse = { data: CourseModule[]; meta: { locked: boolean; section_activity_counts?: Record<string, number> } };
export const courseStructure = {
  sections: (courseId: string) => api.get<CourseSection[]>(`/courses/${courseId}/sections`),
  lessons: (courseId: string) => api.get<CourseLesson[]>(`/courses/${courseId}/lessons`),
  modules: (courseId: string) => api.getRaw<LockedModulesResponse>(`/courses/${courseId}/modules`),
  completion: (courseId: string) => api.get<CompletionStatus>(`/courses/${courseId}/completion`),
  markActivity: (moduleId: string) => api.post(`/modules/${moduleId}/completion`, {}),
};


export type TrendPoint = { label: string; value: number };
export type ReportTrends = {
  enrolments: TrendPoint[];
  revenue: TrendPoint[];
  completion_breakdown: { completed: number; in_progress: number } | null;
  top_courses: TrendPoint[];
};
export const reports = {
  trends: () => api.get<ReportTrends>('/reports/trends'),
};


export type PlatformOverview = {
  active_tenants: number; suspended_tenants: number;
  total_users: number; new_users_30d: number; new_users_7d: number;
  total_courses: number; published_courses: number; total_programs: number;
  revenue_minor: number; paid_orders: number; pending_orders: number; failed_orders: number; active_today: number; active_users_7d: number;
  students: number; teachers: number; managers: number; admins: number;
};
export type PaymentProvider = { provider: string; status: string; count: number; total: number };
export type PlatformAnalytics = {
  user_growth: { label: string; value: number }[];
  course_growth: { label: string; value: number }[];
  revenue: { label: string; value: number }[];
  payment_providers: PaymentProvider[];
};
export type PlatformActivityItem = { action: string; target_type?: string|null; created_at: string; ip?: string|null; actor_email?: string|null; tenant_name?: string|null };
export type PlatformActivity = { activity: PlatformActivityItem[]; security: PlatformActivityItem[] };
export const operator = {
  stats: () => api.get<PlatformOverview>('/operator/stats'),
  analytics: () => api.get<PlatformAnalytics>('/operator/analytics'),
  activity: () => api.get<PlatformActivity>('/operator/activity'),
  tenants: () => api.get<PlatformTenant[]>('/operator/tenants'),
  setStatus: (tenantId: string, status: string) => api.patch(`/operator/tenants/${tenantId}/status`, { status }),
};


export type TopCourse = { id: string; label: string; shortname: string; enrolments: number; completions: number };
export type OrgOverview = {
  total_courses: number; published_courses: number; draft_courses: number;
  total_programs: number; active_enrolments: number; inactive_enrolments: number; new_enrolments_7d: number; completed_courses: number;
  revenue_minor: number; paid_payments: number; pending_payments: number; failed_payments: number;
  students: number; teachers: number; new_students_30d: number; active_learners: number;
  avg_performance_pct: number | null; graded_learners: number; pass_rate_pct: number | null;
  top_courses: TopCourse[];
};
export type TeacherActivity = { id: string; email: string; courses: number; students: number };
export type OrgActivityItem = { action: string; target_type?: string|null; created_at: string; actor_email?: string|null };
export const orgReports = {
  overview: () => api.get<OrgOverview>('/reports/org'),
  teachers: () => api.get<TeacherActivity[]>('/reports/teachers'),
  activity: () => api.get<OrgActivityItem[]>('/reports/activity'),
};


export type TeacherCourse = { id: string; shortname: string; fullname: string; status: string; students: number; completed: number; total_activities: number; pending_grading: number; last_activity: string|null; avg_grade_pct: number|null; forum_count: number };
export type PendingGrade = { submission_id: string; assignment_id: string; title: string; student: string; submitted_at: string|null; is_late: boolean; course: string };
export type QuizReview = { attempt_id: string; quiz_id: string; quiz_title: string; student: string; sumgrade: number|null; finished_at: string|null; course: string };
export type CourseForum = { id: string; name: string; type: string; course: string; course_id: string; discussion_count: number };
export type StudentQuestion = { discussion_id: string; subject: string; forum_id: string; forum: string; course: string; course_id: string; student: string | null; created_at: string; post_count: number };
export type TeacherOverview = {
  assigned_courses: number; total_students: number; pending_grading: number;
  active_forums: number; completed_grading: number; pending: PendingGrade[];
  pending_quiz_reviews: QuizReview[]; course_forums: CourseForum[];
  student_questions: StudentQuestion[];
};
export type TeacherStudent = { id: string; email: string; course: string; course_id: string; status: string; grade_pct: number; completed: boolean; done_activities: number; total_activities: number };
export const teacher = {
  courses: () => api.get<TeacherCourse[]>('/teacher/courses'),
  overview: () => api.get<TeacherOverview>('/teacher/overview'),
  students: () => api.get<TeacherStudent[]>('/teacher/students'),
};


export type StudentCourse = { id: string; shortname: string; fullname: string; status: string; total_activities: number; completed_activities: number; total_lessons: number; completion_state: string|null; instructor: string|null; is_paid: boolean; price_minor: number; locked: boolean };
export type ContinueLearning = { course_id: string; course: string; last_lesson: string|null; next_activity: string|null; next_type: string|null; progress_pct: number } | null;
export type PendingAssignment = { id: string; title: string; due_at: string|null; course_id: string; course: string; submission_state: string|null; workflow_state: string|null; submitted_at: string|null };
export type SubmittedAssignment = { id: string; title: string; course_id: string; course: string; submission_state: string|null; workflow_state: string|null; submitted_at: string|null; is_late: boolean; feedback: Record<string, unknown>|null; grade: number|null; grade_max: number|null };
export type UpcomingItem = { id: string; title: string; due_at: string; course_id: string; course: string; kind: string };
export type AvailableQuiz = { id: string; name: string; close_at: string|null; attempts_allowed: number; course_id: string; course: string; attempts_taken: number };
export type QuizResult = { attempt_id: string; attempt_no: number; sumgrade: number|null; finished_at: string|null; quiz_id: string; quiz: string; course: string; max_mark: number };
export type ForumActivity = { discussion_id: string; subject: string; pinned: boolean; forum_id: string; forum: string; course_id: string; course: string; post_count: number; last_post_at: string|null };
export type AnnouncementItem = { id: string; subject: string; published_at: string; pinned: boolean; course_id: string; course: string };
export type StudentNotification = { id: string; type: string; payload: Record<string, unknown>; read_at: string|null; created_at: string };
export type LearningProgress = {
  completed_activities: number; total_activities: number;
  completed_lessons: number; total_lessons: number;
  remaining_activities: number; course_completion_pct: number;
};
export type StudentOverview = {
  enrolled_courses: number; completed_courses: number; locked_courses: number; pending_assignments: number; certificates: number;
  continue_learning: ContinueLearning; progress: LearningProgress;
  pending: PendingAssignment[]; submitted: SubmittedAssignment[]; upcoming: UpcomingItem[];
  quizzes_available: AvailableQuiz[]; quiz_results: QuizResult[];
  forums: ForumActivity[]; announcements: AnnouncementItem[];
  notifications: StudentNotification[]; unread_notifications: number;
};
export const student = {
  courses: () => api.get<StudentCourse[]>('/student/courses'),
  overview: () => api.get<StudentOverview>('/student/overview'),
};
