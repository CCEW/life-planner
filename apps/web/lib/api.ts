const API_URL = "/api/proxy";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | undefined>
): Promise<{ data: T }> {
  let url = `${API_URL}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = Object.assign(new Error(data?.message ?? res.statusText), {
      response: { data },
    });
    throw err;
  }

  return { data: data as T };
}

const api = {
  get: <T = unknown>(path: string, opts?: { params?: Record<string, string | number | undefined> }) =>
    request<T>("GET", path, undefined, opts?.params),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>("POST", path, body),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body),
  delete: <T = unknown>(path: string) =>
    request<T>("DELETE", path),
};

export default api;

// Auth
export const register = (data: { fullName: string; email: string; password: string; major?: string; graduationYear?: number }) =>
  api.post("/auth/register", data);
export const login = (email: string, password: string) =>
  api.post("/auth/login", { email, password });
export const getMe = () => api.get("/auth/me");
export const updateMe = (data: { fullName?: string; major?: string; graduationYear?: number }) =>
  api.patch("/auth/me", data);

// Courses
export const getCourses = (params?: { q?: string; department?: string; page?: number; limit?: number }) =>
  api.get("/courses", { params });
export const getDepartments = () => api.get("/courses/departments");
export const getCourse = (id: string) => api.get(`/courses/${id}`);

// User Courses
export const getUserCourses = (status?: string) =>
  api.get("/user-courses", { params: status ? { status } : {} });
export const addUserCourse = (data: { courseId: string; status: string; grade?: string; quarter?: string }) =>
  api.post("/user-courses", data);
export const updateUserCourse = (id: string, data: { status?: string; grade?: string; quarter?: string }) =>
  api.patch(`/user-courses/${id}`, data);
export const deleteUserCourse = (id: string) => api.delete(`/user-courses/${id}`);

// Degree Audit
export const runDegreeAudit = (major?: string) =>
  api.post("/degree-audit/run", major ? { major } : {});

// Recommendations
export const getRecommendations = (quarter?: string) =>
  api.get("/recommendations", { params: quarter ? { quarter } : {} });

// AI
export const chatWithAI = (
  message: string,
  history?: { role: string; content: string }[],
  options?: {
    targetQuarter?: string;
    scheduleContext?: {
      calendarConnected?: boolean;
      events?: { title?: string; time?: string; location?: string }[];
    };
  }
) =>
  api.post("/ai/chat", {
    message,
    history,
    targetQuarter: options?.targetQuarter,
    scheduleContext: options?.scheduleContext,
  });
