import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/utils/lazyWithRetry";
import { PaymentResult } from "./helpers";

const Index = lazyWithRetry(() => import("@/pages/Index"));
const Login = lazyWithRetry(() => import("@/pages/Login"));
const BrandedLogin = lazyWithRetry(() => import("@/pages/BrandedLogin"));
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));
const RegisterOrganization = lazyWithRetry(() => import("@/pages/RegisterOrganization"));
const Features = lazyWithRetry(() => import("@/pages/Features"));
const About = lazyWithRetry(() => import("@/pages/About"));
const Blog = lazyWithRetry(() => import("@/pages/Blog"));
const BlogPost = lazyWithRetry(() => import("@/pages/BlogPost"));
const Install = lazyWithRetry(() => import("@/pages/Install"));
const FeatureFRDO = lazyWithRetry(() => import("@/pages/FeatureFRDO"));
const FeatureDocuments = lazyWithRetry(() => import("@/pages/FeatureDocuments"));
const FeatureVideoId = lazyWithRetry(() => import("@/pages/FeatureVideoId"));
const FeatureLaborSafety = lazyWithRetry(() => import("@/pages/FeatureLaborSafety"));
const FeatureCourseStore = lazyWithRetry(() => import("@/pages/FeatureCourseStore"));
const FeatureDocumentChecklist = lazyWithRetry(() => import("@/pages/FeatureDocumentChecklist"));
const FeatureCourseSettings = lazyWithRetry(() => import("@/pages/FeatureCourseSettings"));
const FeatureBranding = lazyWithRetry(() => import("@/pages/FeatureBranding"));
const FeatureAICourses = lazyWithRetry(() => import("@/pages/FeatureAICourses"));
const RoadmapPage = lazyWithRetry(() => import("@/pages/RoadmapPage"));
const RostechnadzorCoursesPage = lazyWithRetry(() => import("@/pages/RostechnadzorCoursesPage"));
const PublicOffer = lazyWithRetry(() => import("@/pages/PublicOffer"));
const StudentAgreement = lazyWithRetry(() => import("@/pages/StudentAgreement"));
const PrivacyPolicy = lazyWithRetry(() => import("@/pages/PrivacyPolicy"));
const PersonalDataPolicy = lazyWithRetry(() => import("@/pages/PersonalDataPolicy"));
const EmailResponse = lazyWithRetry(() => import("@/pages/EmailResponse"));
const ProposalPublic = lazyWithRetry(() => import("@/pages/ProposalPublic"));
const PlatformPresentation = lazyWithRetry(() => import("@/pages/PlatformPresentation"));
const WhatsNew = lazyWithRetry(() => import("@/pages/WhatsNew"));
const HelpCenter = lazyWithRetry(() => import("@/pages/HelpCenter"));
const JoinByLink = lazyWithRetry(() => import("@/pages/JoinByLink"));
const CourseLanding = lazyWithRetry(() => import("@/pages/CourseLanding"));
const OrganizationShowcase = lazyWithRetry(() => import("@/pages/OrganizationShowcase"));
const DemoJoin = lazyWithRetry(() => import("@/pages/DemoJoin"));
const DemoDashboard = lazyWithRetry(() => import("@/components/demo/DemoDashboard"));
const PublicCompanyCard = lazyWithRetry(() => import("@/pages/PublicCompanyCard"));
const SignDocument = lazyWithRetry(() => import("@/pages/SignDocument"));
const VerifyDocument = lazyWithRetry(() => import("@/pages/VerifyDocument"));
const WebinarPublic = lazyWithRetry(() => import("@/pages/WebinarPublic"));
const DocumentSharePage = lazyWithRetry(() => import("@/pages/DocumentSharePage"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));

export const publicRoutes = (
  <>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<Login />} />
    <Route path="/login/:slug" element={<BrandedLogin />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/register" element={<RegisterOrganization />} />
    <Route path="/register-organization" element={<RegisterOrganization />} />
    <Route path="/payment-success" element={<PaymentResult success={true} />} />
    <Route path="/payment-fail" element={<PaymentResult success={false} />} />
    <Route path="/join/:token" element={<JoinByLink />} />
    <Route path="/course/:courseId/landing" element={<CourseLanding />} />
    <Route path="/c/:slug" element={<CourseLanding />} />
    <Route path="/o/:slug" element={<OrganizationShowcase />} />
    <Route path="/features" element={<Features />} />
    <Route path="/about" element={<About />} />
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    <Route path="/install" element={<Install />} />
    <Route path="/feature/frdo" element={<FeatureFRDO />} />
    <Route path="/feature/documents" element={<FeatureDocuments />} />
    <Route path="/feature/video-id" element={<FeatureVideoId />} />
    <Route path="/feature/labor-safety" element={<FeatureLaborSafety />} />
    <Route path="/feature/course-store" element={<FeatureCourseStore />} />
    <Route path="/feature/document-checklist" element={<FeatureDocumentChecklist />} />
    <Route path="/feature/course-settings" element={<FeatureCourseSettings />} />
    <Route path="/feature/branding" element={<FeatureBranding />} />
    <Route path="/feature/ai-courses" element={<FeatureAICourses />} />
    <Route path="/roadmap" element={<RoadmapPage />} />
    <Route path="/rostechnadzor-courses" element={<RostechnadzorCoursesPage />} />
    <Route path="/public-offer" element={<PublicOffer />} />
    <Route path="/student-agreement" element={<StudentAgreement />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/personal-data" element={<PersonalDataPolicy />} />
    <Route path="/email-response" element={<EmailResponse />} />
    <Route path="/proposal/:id" element={<ProposalPublic />} />
    <Route path="/presentation" element={<PlatformPresentation />} />
    <Route path="/whats-new" element={<WhatsNew />} />
    <Route path="/help" element={<HelpCenter />} />
    <Route path="/demo/:token" element={<DemoJoin />} />
    <Route path="/demo/:token/dashboard" element={<DemoDashboard />} />
    <Route path="/company-card/:token" element={<PublicCompanyCard />} />
    <Route path="/sign/:token" element={<SignDocument />} />
    <Route path="/verify" element={<VerifyDocument />} />
    <Route path="/verify/:regNumber" element={<VerifyDocument />} />
    <Route path="/w/:token" element={<WebinarPublic />} />
    <Route path="/document/share/:token" element={<DocumentSharePage />} />
    <Route path="*" element={<NotFound />} />
  </>
);
