-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'organization', 'student');

-- ============================================
-- Organizations table
-- ============================================
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  inn TEXT,
  contact_name TEXT,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Profiles table (linked to auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- User roles table
-- ============================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'student'
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Course categories
-- ============================================
CREATE TABLE public.course_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Courses table
-- ============================================
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.course_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Lessons table
-- ============================================
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Enrollments (student course registrations)
-- ============================================
CREATE TABLE public.enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  time_spent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Lesson progress
-- ============================================
CREATE TABLE public.lesson_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  time_spent INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, lesson_id)
);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Test questions
-- ============================================
CREATE TABLE public.test_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Test attempts
-- ============================================
CREATE TABLE public.test_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Chat messages (AI assistant)
-- ============================================
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Registration links
-- ============================================
CREATE TABLE public.registration_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT,
  inn TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_links ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Organization documents
-- ============================================
CREATE TABLE public.org_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Student documents
-- ============================================
CREATE TABLE public.student_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper functions
-- ============================================

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = _user_id);
END;
$$;

-- Function to check if user has role
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$$;

-- Function to get current user's organization
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid());
END;
$$;

-- ============================================
-- Auto-update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_documents_updated_at BEFORE UPDATE ON public.org_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_documents_updated_at BEFORE UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Auto-create profile on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RLS Policies
-- ============================================

-- Organizations policies
CREATE POLICY "Admins can do everything with organizations" ON public.organizations FOR ALL USING (public.has_role('admin', auth.uid()));
CREATE POLICY "Org users can view their organization" ON public.organizations FOR SELECT USING (id = public.current_organization_id());
CREATE POLICY "Org users can update their organization" ON public.organizations FOR UPDATE USING (id = public.current_organization_id());

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role('admin', auth.uid()));
CREATE POLICY "Org users can view profiles in their org" ON public.profiles FOR SELECT USING (organization_id = public.current_organization_id());

-- User roles policies
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role('admin', auth.uid()));

-- Course categories policies
CREATE POLICY "Anyone can view categories" ON public.course_categories FOR SELECT USING (true);
CREATE POLICY "Org users can manage their categories" ON public.course_categories FOR ALL USING (organization_id = public.current_organization_id());

-- Courses policies
CREATE POLICY "Published courses are viewable by all" ON public.courses FOR SELECT USING (is_published = true);
CREATE POLICY "Org users can view own courses" ON public.courses FOR SELECT USING (organization_id = public.current_organization_id());
CREATE POLICY "Org users can manage their courses" ON public.courses FOR ALL USING (organization_id = public.current_organization_id());

-- Lessons policies
CREATE POLICY "Lessons viewable if enrolled or org user" ON public.lessons FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.is_published = true)
  OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.organization_id = public.current_organization_id())
);
CREATE POLICY "Org users can manage lessons" ON public.lessons FOR ALL USING (
  EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.organization_id = public.current_organization_id())
);

-- Enrollments policies
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own enrollments" ON public.enrollments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own enrollments" ON public.enrollments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Org users can view enrollments for their courses" ON public.enrollments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.organization_id = public.current_organization_id())
);

-- Lesson progress policies
CREATE POLICY "Users can manage own progress" ON public.lesson_progress FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Org users can view progress for their courses" ON public.lesson_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id WHERE l.id = lesson_id AND c.organization_id = public.current_organization_id())
);

-- Test questions policies
CREATE POLICY "Test questions viewable with course access" ON public.test_questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id WHERE l.id = lesson_id AND (c.is_published = true OR c.organization_id = public.current_organization_id()))
);
CREATE POLICY "Org users can manage test questions" ON public.test_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id WHERE l.id = lesson_id AND c.organization_id = public.current_organization_id())
);

-- Test attempts policies
CREATE POLICY "Users can manage own test attempts" ON public.test_attempts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Org users can view attempts for their courses" ON public.test_attempts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id WHERE l.id = lesson_id AND c.organization_id = public.current_organization_id())
);

-- Chat messages policies
CREATE POLICY "Users can manage own messages" ON public.chat_messages FOR ALL USING (user_id = auth.uid());

-- Registration links policies
CREATE POLICY "Org users can manage their links" ON public.registration_links FOR ALL USING (organization_id = public.current_organization_id());
CREATE POLICY "Public can view valid links" ON public.registration_links FOR SELECT USING (expires_at IS NULL OR expires_at > now());

-- Org documents policies
CREATE POLICY "Org users can manage org documents" ON public.org_documents FOR ALL USING (organization_id = public.current_organization_id());

-- Student documents policies
CREATE POLICY "Users can view own documents" ON public.student_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND e.user_id = auth.uid())
);
CREATE POLICY "Org users can manage student documents" ON public.student_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id WHERE e.id = enrollment_id AND c.organization_id = public.current_organization_id())
);