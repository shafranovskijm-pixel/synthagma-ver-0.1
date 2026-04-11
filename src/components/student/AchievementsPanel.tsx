import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Sparkles, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  rarity: string;
  category: string;
  is_secret: boolean;
}

type Rarity = "common" | "rare" | "epic" | "legendary";

interface UserAchievement {
  id: string;
  achievement_id: string;
  earned_at: string;
  is_seen: boolean;
  achievement: Achievement;
}

interface AchievementsPanelProps {
  userId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
}

const rarityColors: Record<Rarity, string> = {
  common: "from-slate-400 to-slate-500",
  rare: "from-blue-400 to-blue-600",
  epic: "from-purple-400 to-purple-600",
  legendary: "from-amber-400 to-orange-500",
};

const rarityBgColors: Record<Rarity, string> = {
  common: "bg-slate-100 dark:bg-slate-800",
  rare: "bg-blue-50 dark:bg-blue-950",
  epic: "bg-purple-50 dark:bg-purple-950",
  legendary: "bg-amber-50 dark:bg-amber-950",
};

const rarityLabels: Record<Rarity, string> = {
  common: "Обычное",
  rare: "Редкое",
  epic: "Эпичное",
  legendary: "Легендарное",
};

const rarityBadgeVariants: Record<Rarity, "default" | "secondary" | "destructive" | "outline"> = {
  common: "secondary",
  rare: "default",
  epic: "default",
  legendary: "default",
};

const categoryLabels: Record<string, string> = {
  start: "Старт обучения",
  progress: "Прогресс",
  activity: "Активность",
  assessment: "Аттестация",
  return: "Возвращение",
  secret: "Секретные",
};

const getRarity = (rarity: string): Rarity => {
  if (rarity === "common" || rarity === "rare" || rarity === "epic" || rarity === "legendary") {
    return rarity;
  }
  return "common";
};

export function AchievementsPanel({ userId, isOpen, onOpenChange }: AchievementsPanelProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAchievements, setNewAchievements] = useState<UserAchievement[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebratingAchievement, setCelebratingAchievement] = useState<UserAchievement | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadAchievements();
    }
  }, [isOpen, userId]);

  const loadAchievements = async () => {
    setLoading(true);
    try {
      // Load all achievements
      const { data: allAchievements } = await supabase
        .from("achievements")
        .select("*")
        .order("category", { ascending: true });

      if (allAchievements) {
        setAchievements(allAchievements);
      }

      // Load user achievements
      const { data: userAch } = await supabase
        .from("user_achievements")
        .select("*, achievement:achievements(*)")
        .eq("user_id", userId);

      if (userAch) {
        const formatted = userAch.map(ua => ({
          ...ua,
          achievement: ua.achievement as Achievement
        }));
        setUserAchievements(formatted);

        // Find unseen achievements
        const unseen = formatted.filter(ua => !ua.is_seen);
        if (unseen.length > 0) {
          setNewAchievements(unseen);
          // Start celebration for first unseen
          showNextCelebration(unseen);
        }
      }
    } catch (error) {
      console.error("Error loading achievements:", error);
    } finally {
      setLoading(false);
    }
  };

  const showNextCelebration = async (unseen: UserAchievement[]) => {
    if (unseen.length === 0) return;
    
    const first = unseen[0];
    setCelebratingAchievement(first);
    setShowCelebration(true);

    // Mark as seen
    await supabase
      .from("user_achievements")
      .update({ is_seen: true })
      .eq("id", first.id);
  };

  const handleCelebrationClose = () => {
    setShowCelebration(false);
    setCelebratingAchievement(null);
    
    // Show next unseen achievement
    const remaining = newAchievements.filter(a => a.id !== celebratingAchievement?.id);
    setNewAchievements(remaining);
    if (remaining.length > 0) {
      setTimeout(() => showNextCelebration(remaining), 500);
    }
  };

  const earnedIds = new Set(userAchievements.map(ua => ua.achievement_id));
  const groupedAchievements = achievements.reduce((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {} as Record<string, Achievement[]>);

  const earnedCount = userAchievements.length;
  const totalCount = achievements.filter(a => !a.is_secret).length;

  return (
    <>
      {/* Celebration Modal */}
      <AnimatePresence>
        {showCelebration && celebratingAchievement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={handleCelebrationClose}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
              className="relative text-center p-8"
              onClick={e => e.stopPropagation()}
            >
              {/* Particles */}
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    background: `hsl(${Math.random() * 360}, 70%, 60%)`,
                    left: "50%",
                    top: "50%",
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: (Math.random() - 0.5) * 300,
                    y: (Math.random() - 0.5) * 300,
                    opacity: 0,
                    scale: Math.random() * 2,
                  }}
                  transition={{ duration: 1.5, delay: i * 0.05 }}
                />
              ))}

              {/* Achievement icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.2 }}
                className={`w-32 h-32 rounded-full mx-auto mb-6 flex items-center justify-center text-6xl shadow-2xl bg-gradient-to-br ${rarityColors[getRarity(celebratingAchievement.achievement.rarity)]}`}
              >
                {celebratingAchievement.achievement.icon}
              </motion.div>

              {/* Achievement name */}
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-3xl font-display font-bold text-white mb-2"
              >
                {celebratingAchievement.achievement.name}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-white/80 text-lg mb-4"
              >
                {celebratingAchievement.achievement.description}
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <Badge className={`${
                  celebratingAchievement.achievement.rarity === "legendary" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0" :
                  celebratingAchievement.achievement.rarity === "epic" ? "bg-purple-500 text-white border-0" :
                  celebratingAchievement.achievement.rarity === "rare" ? "bg-blue-500 text-white border-0" :
                  "bg-slate-500 text-white border-0"
                }`}>
                  {rarityLabels[getRarity(celebratingAchievement.achievement.rarity)]}
                </Badge>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-8"
              >
                <Button
                  onClick={handleCelebrationClose}
                  className="btn-gradient rounded-xl px-8"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Круто!
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Achievements Panel */}
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 font-display text-xl">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              Мои достижения
              <Badge variant="secondary" className="ml-auto">
                {earnedCount} / {totalCount}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Trophy className="w-8 h-8 text-primary" />
              </motion.div>
            </div>
          ) : (
            <div className="space-y-8 mt-4">
              {Object.entries(groupedAchievements).map(([category, categoryAchievements]) => (
                <div key={category}>
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    {categoryLabels[category] || category}
                    <span className="text-sm text-muted-foreground font-normal">
                      ({categoryAchievements.filter(a => earnedIds.has(a.id)).length}/{categoryAchievements.filter(a => !a.is_secret || earnedIds.has(a.id)).length})
                    </span>
                  </h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {categoryAchievements.map((achievement) => {
                      const isEarned = earnedIds.has(achievement.id);
                      const isHidden = achievement.is_secret && !isEarned;

                      return (
                        <motion.div
                          key={achievement.id}
                          whileHover={{ scale: isEarned ? 1.05 : 1 }}
                          className={`relative rounded-xl p-4 text-center transition-all ${
                            isEarned 
                              ? rarityBgColors[getRarity(achievement.rarity)]
                              : "bg-muted/50 opacity-50"
                          } ${isEarned ? "cursor-pointer" : ""}`}
                        >
                          {/* Rarity glow for earned */}
                          {isEarned && achievement.rarity !== "common" && (
                            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${rarityColors[getRarity(achievement.rarity)]} opacity-10`} />
                          )}

                          <div className={`relative z-10 text-4xl mb-2 ${!isEarned ? "grayscale" : ""}`}>
                            {isHidden ? (
                              <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                                <Lock className="w-6 h-6 text-muted-foreground" />
                              </div>
                            ) : (
                              achievement.icon
                            )}
                          </div>

                          <h4 className="font-medium text-sm mb-1 relative z-10">
                            {isHidden ? "???" : achievement.name}
                          </h4>

                          {!isHidden && (
                            <p className="text-xs text-muted-foreground line-clamp-2 relative z-10">
                              {achievement.description}
                            </p>
                          )}

                          {isEarned && (
                            <Badge 
                              className={`mt-2 text-xs ${
                                achievement.rarity === "legendary" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0" :
                                achievement.rarity === "epic" ? "bg-purple-500 text-white border-0" :
                                achievement.rarity === "rare" ? "bg-blue-500 text-white border-0" :
                                ""
                              }`}
                              variant={rarityBadgeVariants[getRarity(achievement.rarity)]}
                            >
                              {rarityLabels[getRarity(achievement.rarity)]}
                            </Badge>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
