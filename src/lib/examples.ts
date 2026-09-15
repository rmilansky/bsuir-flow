export const examples = [
  {
    id: 'max', title: 'Максимум из двух чисел', description: 'Ввод, условие и две ветки', tag: 'Начните здесь',
    code: `#include <stdio.h>

int main(void) {
    int a, b;

    // Ввести два числа
    scanf("%d %d", &a, &b);

    // Первое число больше?
    if (a > b) {
        // Вывести первое число
        printf("Максимум: %d", a);
    } else {
        // Вывести второе число
        printf("Максимум: %d", b);
    }

    return 0;
}
`,
  },
  {
    id: 'factorial', title: 'Факториал числа', description: 'Цикл for и накопление результата', tag: 'Циклы',
    code: `#include <stdio.h>

int main(void) {
    int n;
    unsigned long long result = 1;
    scanf("%d", &n); // Ввести число n

    // Множитель не больше n?
    for (int i = 1; i <= n; i++) {
        result *= i; // Умножить результат на i
    }

    printf("%llu", result); // Вывести факториал
    return 0;
}
`,
  },
  {
    id: 'gcd', title: 'Алгоритм Евклида', description: 'Цикл while и несколько функций', tag: 'Функции',
    code: `#include <stdio.h>

int gcd(int a, int b) {
    // Остаток не равен нулю?
    while (b != 0) {
        int remainder = a % b; // Вычислить остаток
        a = b;
        b = remainder;
    }
    return a; // Вернуть НОД
}

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b); // Ввести два числа
    int result = gcd(a, b);
    printf("НОД: %d", result); // Вывести НОД
    return 0;
}
`,
  },
  {
    id: 'menu', title: 'Меню программы', description: 'do…while, switch и break', tag: 'Ветвления',
    code: `#include <stdio.h>

int main(void) {
    int choice;
    do {
        scanf("%d", &choice); // Выбрать действие
        switch (choice) {
            case 1:
                puts("Привет!"); // Показать приветствие
                break;
            case 2:
                puts("Справка"); // Показать справку
                break;
            default:
                puts("Выход");
        }
    } while (choice != 0);
    return 0;
}
`,
  },
  {
    id: 'ternary', title: 'Тернарные операторы', description: 'Выбор значения через ?: и вложенные условия', tag: 'Ветвления',
    code: `#include <stdio.h>

int sign(int n) {
    // Определить знак числа
    return n > 0 ? 1 : n < 0 ? -1 : 0;
}

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b); // Ввести два числа

    // Выбрать большее число
    int max = a > b ? a : b;
    printf("Максимум: %d\\n", max);

    // Числа равны?
    puts(a == b ? "Числа равны" : "Числа различаются");
    printf("Знак максимума: %d", sign(max));
    return 0;
}
`,
  },
];
