"use client";

import Link from "next/link";
import { Card, CardBody, Progress } from "@heroui/react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Target,
  ArrowRight,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Repeat,
  Settings,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useTotalIncome,
  useTotalExpenses,
  useBalance,
  useBudgets,
  useGoals,
  useExpensesByCategory,
  useRecentTransactions,
  useTotalBudget,
  useTotalBudgetSpent,
  useTotalGoalTarget,
  useTotalGoalSaved,
} from "@/lib/stores";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FloatingCalculator } from "@/components/shared/floating-calculator";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function FinanceDashboard() {
  const totalIncome = useTotalIncome();
  const totalExpenses = useTotalExpenses();
  const balance = useBalance();
  const budgets = useBudgets();
  const goals = useGoals();
  const expensesByCategory = useExpensesByCategory();
  const recentTransactions = useRecentTransactions(5);
  const totalBudget = useTotalBudget();
  const totalBudgetSpent = useTotalBudgetSpent();
  const totalGoalTarget = useTotalGoalTarget();
  const totalGoalSaved = useTotalGoalSaved();

  // Budget progress percentage
  const budgetProgress = totalBudget > 0 ? Math.round((totalBudgetSpent / totalBudget) * 100) : 0;

  // Goal progress percentage
  const goalProgress = totalGoalTarget > 0 ? Math.round((totalGoalSaved / totalGoalTarget) * 100) : 0;

  // Monthly trend data (simplified - using current data)
  const trendData = [
    { name: "Income", value: totalIncome, fill: "#10b981" },
    { name: "Expenses", value: totalExpenses, fill: "#ef4444" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Finance Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Track your income, expenses, and financial goals
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Total Income</p>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
                  {formatCurrency(totalIncome)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={24} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-rose-700 dark:text-rose-400">Total Expenses</p>
                <p className="text-2xl font-bold text-rose-900 dark:text-rose-300 mt-1">
                  {formatCurrency(totalExpenses)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                <TrendingDown className="text-rose-600 dark:text-rose-400" size={24} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardBody className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-400">Balance</p>
                <p className={`text-2xl font-bold mt-1 ${balance >= 0 ? "text-blue-900 dark:text-blue-300" : "text-rose-900 dark:text-rose-300"}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Wallet className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions - Mobile Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:hidden gap-3">
        <Link href="/finance/expenses">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <ArrowDownCircle className="text-rose-600" size={20} />
              </div>
              <span className="text-sm font-medium">Expenses</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/finance/income">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ArrowUpCircle className="text-emerald-600" size={20} />
              </div>
              <span className="text-sm font-medium">Income</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/finance/budget">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <PiggyBank className="text-blue-600" size={20} />
              </div>
              <span className="text-sm font-medium">Budget</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/finance/goals">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Target className="text-purple-600" size={20} />
              </div>
              <span className="text-sm font-medium">Goals</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/finance/recurring">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Repeat className="text-amber-600" size={20} />
              </div>
              <span className="text-sm font-medium">Recurring</span>
            </CardBody>
          </Card>
        </Link>
        <Link href="/finance/settings">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardBody className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Settings className="text-gray-600" size={20} />
              </div>
              <span className="text-sm font-medium">Settings</span>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <Card>
          <CardBody className="p-5">
            <h3 className="font-semibold mb-4">Income vs Expenses</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => `$${value}`} />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Expenses by Category Pie Chart */}
        <Card>
          <CardBody className="p-5">
            <h3 className="font-semibold mb-4">Expenses by Category</h3>
            <div className="h-64">
              {expensesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensesByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {expensesByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No expense data
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Budget & Goals Overview */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Budget Overview */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <PiggyBank size={20} className="text-blue-500" />
                Budget Overview
              </h3>
              <Link href="/finance/budget" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(totalBudgetSpent)} of {formatCurrency(totalBudget)}
                  </span>
                  <span className="font-medium">{budgetProgress}%</span>
                </div>
                <Progress
                  value={budgetProgress}
                  color={budgetProgress > 90 ? "danger" : budgetProgress > 75 ? "warning" : "primary"}
                />
              </div>
              {budgets.slice(0, 3).map((budget) => {
                const progress = Math.round((budget.spent / budget.amount) * 100);
                return (
                  <div key={budget.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div>
                      <p className="font-medium text-sm">{budget.category}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${progress > 90 ? "text-red-600" : progress > 75 ? "text-amber-600" : "text-green-600"}`}>
                      {progress}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Goals Overview */}
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Target size={20} className="text-purple-500" />
                Savings Goals
              </h3>
              <Link href="/finance/goals" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(totalGoalSaved)} of {formatCurrency(totalGoalTarget)}
                  </span>
                  <span className="font-medium">{goalProgress}%</span>
                </div>
                <Progress value={goalProgress} color="secondary" />
              </div>
              {goals.slice(0, 3).map((goal) => {
                const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
                return (
                  <div key={goal.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div>
                      <p className="font-medium text-sm">{goal.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${progress >= 100 ? "text-green-600" : "text-purple-600"}`}>
                      {progress}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardBody className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock size={20} className="text-gray-500" />
              Recent Activity
            </h3>
            <Link href="/finance/expenses" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No recent transactions</p>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      transaction.type === "income"
                        ? "bg-emerald-100 dark:bg-emerald-900/30"
                        : "bg-rose-100 dark:bg-rose-900/30"
                    }`}>
                      {transaction.type === "income" ? (
                        <TrendingUp size={18} className="text-emerald-600" />
                      ) : (
                        <TrendingDown size={18} className="text-rose-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{transaction.description}</p>
                      <p className="text-xs text-gray-500">{transaction.category} • {formatDate(transaction.date)}</p>
                    </div>
                  </div>
                  <span className={`font-semibold ${
                    transaction.type === "income" ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {transaction.type === "income" ? "+" : "-"}{formatCurrency(transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Floating Calculator */}
      <FloatingCalculator />
    </div>
  );
}
