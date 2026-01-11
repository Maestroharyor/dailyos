"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { Calculator, X, History, Delete } from "lucide-react";

export function FloatingCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const clear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const clearEntry = () => {
    setDisplay("0");
  };

  const toggleSign = () => {
    const value = parseFloat(display);
    setDisplay(String(-value));
  };

  const inputPercent = () => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  };

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue;
      let result = 0;

      switch (operation) {
        case "+":
          result = currentValue + inputValue;
          break;
        case "-":
          result = currentValue - inputValue;
          break;
        case "×":
          result = currentValue * inputValue;
          break;
        case "÷":
          result = inputValue !== 0 ? currentValue / inputValue : 0;
          break;
        default:
          result = inputValue;
      }

      // Add to history
      const historyEntry = `${currentValue} ${operation} ${inputValue} = ${result}`;
      setHistory((prev) => [historyEntry, ...prev.slice(0, 9)]);

      setDisplay(String(result));
      setPreviousValue(result);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  };

  const calculate = () => {
    if (operation === null || previousValue === null) return;

    const inputValue = parseFloat(display);
    let result = 0;

    switch (operation) {
      case "+":
        result = previousValue + inputValue;
        break;
      case "-":
        result = previousValue - inputValue;
        break;
      case "×":
        result = previousValue * inputValue;
        break;
      case "÷":
        result = inputValue !== 0 ? previousValue / inputValue : 0;
        break;
      default:
        result = inputValue;
    }

    // Add to history
    const historyEntry = `${previousValue} ${operation} ${inputValue} = ${result}`;
    setHistory((prev) => [historyEntry, ...prev.slice(0, 9)]);

    setDisplay(String(result));
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  };

  const applyHistoryResult = (entry: string) => {
    const result = entry.split(" = ")[1];
    setDisplay(result);
    setShowHistory(false);
  };

  // Keyboard support
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || showHistory) return;

      // Prevent default for calculator keys to avoid page scrolling etc.
      const calculatorKeys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "+", "-", "*", "/", "Enter", "=", "Escape", "Backspace", "Delete", "c", "C", "%"];
      if (calculatorKeys.includes(e.key)) {
        e.preventDefault();
      }

      // Number keys
      if (/^[0-9]$/.test(e.key)) {
        inputDigit(e.key);
      }
      // Decimal
      else if (e.key === ".") {
        inputDecimal();
      }
      // Operations
      else if (e.key === "+") {
        performOperation("+");
      } else if (e.key === "-") {
        performOperation("-");
      } else if (e.key === "*") {
        performOperation("×");
      } else if (e.key === "/") {
        performOperation("÷");
      }
      // Calculate
      else if (e.key === "Enter" || e.key === "=") {
        calculate();
      }
      // Clear
      else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        clear();
      }
      // Backspace/Delete - clear entry
      else if (e.key === "Backspace" || e.key === "Delete") {
        clearEntry();
      }
      // Percent
      else if (e.key === "%") {
        inputPercent();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, showHistory]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return (
      <Button
        isIconOnly
        size="lg"
        color="primary"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 shadow-lg rounded-full w-14 h-14"
        onPress={() => setIsOpen(true)}
      >
        <Calculator size={24} />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-72 shadow-2xl">
      <CardBody className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-blue-500" />
            <span className="text-sm font-semibold">Calculator</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setShowHistory(!showHistory)}
            >
              <History size={16} />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => setIsOpen(false)}
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {showHistory ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">History</p>
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No history yet</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {history.map((entry, index) => (
                  <button
                    key={index}
                    onClick={() => applyHistoryResult(entry)}
                    className="w-full text-left text-xs p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {entry}
                  </button>
                ))}
              </div>
            )}
            <Button
              size="sm"
              variant="flat"
              className="w-full"
              onPress={() => setHistory([])}
            >
              Clear History
            </Button>
          </div>
        ) : (
          <>
            {/* Display */}
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mb-3">
              <div className="text-right text-2xl font-mono font-bold truncate">
                {display}
              </div>
              {operation && previousValue !== null && (
                <div className="text-right text-xs text-gray-500">
                  {previousValue} {operation}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-4 gap-1">
              {/* Row 1 */}
              <Button size="sm" variant="flat" onPress={clear}>C</Button>
              <Button size="sm" variant="flat" onPress={clearEntry}>
                <Delete size={14} />
              </Button>
              <Button size="sm" variant="flat" onPress={inputPercent}>%</Button>
              <Button size="sm" color="primary" variant="flat" onPress={() => performOperation("÷")}>÷</Button>

              {/* Row 2 */}
              <Button size="sm" variant="flat" onPress={() => inputDigit("7")}>7</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("8")}>8</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("9")}>9</Button>
              <Button size="sm" color="primary" variant="flat" onPress={() => performOperation("×")}>×</Button>

              {/* Row 3 */}
              <Button size="sm" variant="flat" onPress={() => inputDigit("4")}>4</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("5")}>5</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("6")}>6</Button>
              <Button size="sm" color="primary" variant="flat" onPress={() => performOperation("-")}>−</Button>

              {/* Row 4 */}
              <Button size="sm" variant="flat" onPress={() => inputDigit("1")}>1</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("2")}>2</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("3")}>3</Button>
              <Button size="sm" color="primary" variant="flat" onPress={() => performOperation("+")}>+</Button>

              {/* Row 5 */}
              <Button size="sm" variant="flat" onPress={toggleSign}>±</Button>
              <Button size="sm" variant="flat" onPress={() => inputDigit("0")}>0</Button>
              <Button size="sm" variant="flat" onPress={inputDecimal}>.</Button>
              <Button size="sm" color="primary" onPress={calculate}>=</Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
